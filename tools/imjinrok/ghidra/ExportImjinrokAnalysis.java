// Exports deterministic, address-oriented static-analysis artifacts for the Imjinrok 2 executable.
// @category Imjinrok

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.framework.Application;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressFormatException;
import ghidra.program.model.address.AddressRange;
import ghidra.program.model.address.AddressRangeIterator;
import ghidra.program.model.block.BasicBlockModel;
import ghidra.program.model.block.CodeBlock;
import ghidra.program.model.block.CodeBlockIterator;
import ghidra.program.model.block.CodeBlockReference;
import ghidra.program.model.block.CodeBlockReferenceIterator;
import ghidra.program.model.data.StringDataInstance;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.pcode.HighFunction;
import ghidra.program.model.pcode.JumpTable;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.ReferenceManager;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.util.DefinedStringIterator;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class ExportImjinrokAnalysis extends GhidraScript {
    private static final int SCHEMA_VERSION = 2;
    private static final int DECOMPILE_TIMEOUT_SECONDS = 120;

    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length != 4) {
            throw new IllegalArgumentException(
                "Expected arguments: <output-directory> <source-sha256> <seed-file> <source-id>"
            );
        }

        Path outputDirectory = Paths.get(arguments[0]).toAbsolutePath().normalize();
        String sourceSha256 = arguments[1].toLowerCase(Locale.ROOT);
        Path seedFile = Paths.get(arguments[2]).toAbsolutePath().normalize();
        String sourceId = arguments[3];

        if (!sourceSha256.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("Invalid source SHA-256: " + sourceSha256);
        }
        if (!Files.isRegularFile(seedFile)) {
            throw new IllegalArgumentException("Seed file does not exist: " + seedFile);
        }

        Files.createDirectories(outputDirectory);

        List<SeedEntry> seeds = readSeedEntries(seedFile);
        ensureSeedFunctions(seeds);

        DocumentResult functions = buildFunctionsDocument(sourceSha256);
        DocumentResult strings = buildStringsDocument(sourceSha256);
        DocumentResult references = buildReferencesDocument(sourceSha256);
        JumpTableDocumentResult jumpTables = buildJumpTablesDocument(sourceSha256);
        SeedDocumentResult seedsDocument = buildSeedsDocument(sourceSha256, seeds);
        String manifest = buildManifestDocument(
            sourceSha256,
            sourceId,
            functions.recordCount,
            strings.recordCount,
            references.recordCount,
            jumpTables.candidateCount,
            jumpTables.tableCount,
            seedsDocument.seedCount,
            seedsDocument.functionCount
        );

        writeDocument(outputDirectory.resolve("manifest.json"), manifest);
        writeDocument(outputDirectory.resolve("functions.json"), functions.json);
        writeDocument(outputDirectory.resolve("strings.json"), strings.json);
        writeDocument(outputDirectory.resolve("references.json"), references.json);
        writeDocument(outputDirectory.resolve("jump-tables.json"), jumpTables.json);
        writeDocument(outputDirectory.resolve("seeds.json"), seedsDocument.json);

        println(
            "Exported " + functions.recordCount + " functions, " +
            strings.recordCount + " strings, " + references.recordCount + " references, " +
            jumpTables.candidateCount + " computed jumps, " + jumpTables.tableCount +
            " recovered jump tables, and " + seedsDocument.seedCount + " seeds to " + outputDirectory
        );
    }

    private String buildManifestDocument(
        String sourceSha256,
        String sourceId,
        int functionCount,
        int stringCount,
        int referenceCount,
        int computedJumpCount,
        int jumpTableCount,
        int seedCount,
        int seedFunctionCount
    ) throws Exception {
        StringBuilder json = new StringBuilder();
        json.append("{\n");
        appendNumberField(json, 2, "schemaVersion", SCHEMA_VERSION, true);
        appendStringField(json, 2, "exporter", "ExportImjinrokAnalysis.java", true);
        appendStringField(json, 2, "ghidraVersion", Application.getApplicationVersion(), true);
        appendStringField(json, 2, "sourceId", sourceId, true);
        appendStringField(json, 2, "sourceSha256", sourceSha256, true);
        appendNumberField(
            json,
            2,
            "sourceSize",
            Files.size(Paths.get(currentProgram.getExecutablePath())),
            true
        );
        appendStringField(json, 2, "programName", currentProgram.getName(), true);
        appendStringField(json, 2, "executableFormat", currentProgram.getExecutableFormat(), true);
        appendStringField(json, 2, "languageId", currentProgram.getLanguageID().toString(), true);
        appendStringField(
            json,
            2,
            "compilerSpecId",
            currentProgram.getCompilerSpec().getCompilerSpecID().toString(),
            true
        );
        appendStringField(json, 2, "imageBase", formatAddress(currentProgram.getImageBase()), true);
        appendStringField(json, 2, "minimumAddress", formatAddress(currentProgram.getMinAddress()), true);
        appendStringField(json, 2, "maximumAddress", formatAddress(currentProgram.getMaxAddress()), true);
        appendNumberField(json, 2, "functionCount", functionCount, true);
        appendNumberField(json, 2, "stringCount", stringCount, true);
        appendNumberField(json, 2, "referenceCount", referenceCount, true);
        appendNumberField(json, 2, "computedJumpCount", computedJumpCount, true);
        appendNumberField(json, 2, "jumpTableCount", jumpTableCount, true);
        appendNumberField(json, 2, "seedCount", seedCount, true);
        appendNumberField(json, 2, "seedFunctionCount", seedFunctionCount, true);
        json.append("  \"memoryBlocks\": [\n");

        MemoryBlock[] blocks = currentProgram.getMemory().getBlocks();
        List<MemoryBlock> sortedBlocks = new ArrayList<>(List.of(blocks));
        sortedBlocks.sort(Comparator.comparing(MemoryBlock::getStart));
        for (int index = 0; index < sortedBlocks.size(); index++) {
            MemoryBlock block = sortedBlocks.get(index);
            json.append("    {\n");
            appendStringField(json, 6, "name", block.getName(), true);
            appendStringField(json, 6, "start", formatAddress(block.getStart()), true);
            appendStringField(json, 6, "end", formatAddress(block.getEnd()), true);
            appendNumberField(json, 6, "size", block.getSize(), true);
            appendBooleanField(json, 6, "read", block.isRead(), true);
            appendBooleanField(json, 6, "write", block.isWrite(), true);
            appendBooleanField(json, 6, "execute", block.isExecute(), true);
            appendBooleanField(json, 6, "initialized", block.isInitialized(), false);
            json.append("    }");
            json.append(index + 1 == sortedBlocks.size() ? "\n" : ",\n");
        }

        json.append("  ]\n");
        json.append("}\n");
        return json.toString();
    }

    private DocumentResult buildFunctionsDocument(String sourceSha256) throws Exception {
        StringBuilder json = new StringBuilder();
        json.append("{\n");
        appendNumberField(json, 2, "schemaVersion", SCHEMA_VERSION, true);
        appendStringField(json, 2, "sourceSha256", sourceSha256, true);
        json.append("  \"functions\": [\n");

        FunctionIterator iterator = currentProgram.getFunctionManager().getFunctions(true);
        int count = 0;
        boolean first = true;
        while (iterator.hasNext()) {
            monitor.checkCancelled();
            Function function = iterator.next();
            if (!first) {
                json.append(",\n");
            }
            appendFunctionSummary(json, function, 4);
            first = false;
            count++;
        }

        json.append("\n  ]\n");
        json.append("}\n");
        return new DocumentResult(json.toString(), count);
    }

    private DocumentResult buildStringsDocument(String sourceSha256) throws Exception {
        StringBuilder json = new StringBuilder();
        json.append("{\n");
        appendNumberField(json, 2, "schemaVersion", SCHEMA_VERSION, true);
        appendStringField(json, 2, "sourceSha256", sourceSha256, true);
        json.append("  \"strings\": [\n");

        ReferenceManager referenceManager = currentProgram.getReferenceManager();
        int count = 0;
        boolean first = true;
        for (Data data : DefinedStringIterator.forProgram(currentProgram)) {
            monitor.checkCancelled();
            if (!first) {
                json.append(",\n");
            }

            StringDataInstance stringData = StringDataInstance.getStringDataInstance(data);
            String value = stringData.getStringValue();
            if (value == null) {
                value = data.getDefaultValueRepresentation();
            }

            json.append("    {\n");
            appendStringField(json, 6, "address", formatAddress(data.getAddress()), true);
            appendNumberField(json, 6, "length", data.getLength(), true);
            appendStringField(json, 6, "dataType", data.getDataType().getDisplayName(), true);
            appendStringField(json, 6, "value", value, true);
            json.append("      \"references\": [");

            List<String> references = new ArrayList<>();
            ReferenceIterator referenceIterator = referenceManager.getReferencesTo(data.getAddress());
            while (referenceIterator.hasNext()) {
                Reference reference = referenceIterator.next();
                references.add(
                    formatAddress(reference.getFromAddress()) + "|" +
                    reference.getReferenceType().getName()
                );
            }
            references.sort(String::compareTo);
            appendStringArrayContents(json, references);
            json.append("]\n");
            json.append("    }");

            first = false;
            count++;
        }

        json.append("\n  ]\n");
        json.append("}\n");
        return new DocumentResult(json.toString(), count);
    }

    private DocumentResult buildReferencesDocument(String sourceSha256) throws Exception {
        List<ReferenceRecord> references = new ArrayList<>();
        ReferenceIterator iterator = currentProgram.getReferenceManager()
            .getReferenceIterator(currentProgram.getMinAddress());

        while (iterator.hasNext()) {
            monitor.checkCancelled();
            Reference reference = iterator.next();
            Address fromAddress = reference.getFromAddress();
            Address toAddress = reference.getToAddress();
            if (
                !reference.isMemoryReference() ||
                fromAddress == null ||
                toAddress == null ||
                !currentProgram.getMemory().contains(fromAddress) ||
                !currentProgram.getMemory().contains(toAddress)
            ) {
                continue;
            }

            Function fromFunction = findContainingFunction(fromAddress);
            MemoryBlock fromBlock = currentProgram.getMemory().getBlock(fromAddress);
            MemoryBlock toBlock = currentProgram.getMemory().getBlock(toAddress);
            Symbol toSymbol = currentProgram.getSymbolTable().getPrimarySymbol(toAddress);
            references.add(
                new ReferenceRecord(
                    formatAddress(fromAddress),
                    formatAddress(toAddress),
                    reference.getReferenceType().getName(),
                    reference.getSource().toString(),
                    reference.getOperandIndex(),
                    reference.isPrimary(),
                    fromFunction == null
                        ? null
                        : formatAddress(fromFunction.getEntryPoint()),
                    fromBlock == null ? "" : fromBlock.getName(),
                    toBlock == null ? "" : toBlock.getName(),
                    toSymbol == null ? "" : toSymbol.getName()
                )
            );
        }

        references.sort(
            Comparator.comparing((ReferenceRecord record) -> record.from)
                .thenComparingInt(record -> record.operandIndex)
                .thenComparing(record -> record.to)
                .thenComparing(record -> record.type)
                .thenComparing(record -> record.source)
        );

        StringBuilder json = new StringBuilder();
        json.append("{\n");
        appendNumberField(json, 2, "schemaVersion", SCHEMA_VERSION, true);
        appendStringField(json, 2, "sourceSha256", sourceSha256, true);
        json.append("  \"references\": [\n");
        for (int index = 0; index < references.size(); index++) {
            ReferenceRecord reference = references.get(index);
            json.append("    {\n");
            appendStringField(json, 6, "from", reference.from, true);
            appendStringField(json, 6, "to", reference.to, true);
            appendStringField(json, 6, "type", reference.type, true);
            appendStringField(json, 6, "source", reference.source, true);
            appendNumberField(json, 6, "operandIndex", reference.operandIndex, true);
            appendBooleanField(json, 6, "primary", reference.primary, true);
            if (reference.fromFunctionEntry == null) {
                appendNullField(json, 6, "fromFunctionEntry", true);
            }
            else {
                appendStringField(json, 6, "fromFunctionEntry", reference.fromFunctionEntry, true);
            }
            appendStringField(json, 6, "fromBlock", reference.fromBlock, true);
            appendStringField(json, 6, "toBlock", reference.toBlock, true);
            appendStringField(json, 6, "toSymbol", reference.toSymbol, false);
            json.append("    }");
            json.append(index + 1 == references.size() ? "\n" : ",\n");
        }
        json.append("  ]\n");
        json.append("}\n");
        return new DocumentResult(json.toString(), references.size());
    }

    private JumpTableDocumentResult buildJumpTablesDocument(String sourceSha256) throws Exception {
        List<ComputedJumpRecord> candidates = collectComputedJumps();
        Map<String, Function> candidateFunctions = new LinkedHashMap<>();
        for (ComputedJumpRecord candidate : candidates) {
            if (candidate.function != null) {
                candidateFunctions.put(candidate.functionEntry, candidate.function);
            }
        }

        List<Function> sortedFunctions = new ArrayList<>(candidateFunctions.values());
        sortedFunctions.sort(Comparator.comparing(Function::getEntryPoint));
        List<JumpTableRecord> tables = new ArrayList<>();

        DecompInterface decompiler = new DecompInterface();
        decompiler.toggleCCode(false);
        decompiler.toggleSyntaxTree(true);
        if (!decompiler.openProgram(currentProgram)) {
            throw new IllegalStateException("Decompiler could not open the current program");
        }

        try {
            for (Function function : sortedFunctions) {
                monitor.checkCancelled();
                DecompileResults results = decompiler.decompileFunction(
                    function,
                    DECOMPILE_TIMEOUT_SECONDS,
                    monitor
                );
                HighFunction highFunction = results.getHighFunction();
                if (!results.decompileCompleted() || highFunction == null) {
                    throw new IllegalStateException(
                        "Failed to recover jump tables for " +
                        formatAddress(function.getEntryPoint()) + ": " +
                        results.getErrorMessage()
                    );
                }

                for (JumpTable jumpTable : highFunction.getJumpTables()) {
                    tables.add(toJumpTableRecord(function, jumpTable));
                }
            }
        }
        finally {
            decompiler.dispose();
        }

        tables.sort(
            Comparator.comparing((JumpTableRecord record) -> record.switchAddress)
                .thenComparing(record -> record.functionEntry)
        );
        Set<String> recoveredAddresses = new HashSet<>();
        for (JumpTableRecord table : tables) {
            recoveredAddresses.add(table.switchAddress);
        }

        StringBuilder json = new StringBuilder();
        json.append("{\n");
        appendNumberField(json, 2, "schemaVersion", SCHEMA_VERSION, true);
        appendStringField(json, 2, "sourceSha256", sourceSha256, true);
        json.append("  \"candidates\": [\n");
        for (int index = 0; index < candidates.size(); index++) {
            ComputedJumpRecord candidate = candidates.get(index);
            json.append("    {\n");
            appendStringField(json, 6, "address", candidate.address, true);
            if (candidate.functionEntry == null) {
                appendNullField(json, 6, "functionEntry", true);
            }
            else {
                appendStringField(json, 6, "functionEntry", candidate.functionEntry, true);
            }
            appendStringField(json, 6, "instruction", candidate.instruction, true);
            json.append("      \"destinations\": [");
            appendStringArrayContents(json, candidate.destinations);
            json.append("],\n");
            appendBooleanField(
                json,
                6,
                "recovered",
                recoveredAddresses.contains(candidate.address),
                false
            );
            json.append("    }");
            json.append(index + 1 == candidates.size() ? "\n" : ",\n");
        }
        json.append("  ],\n");
        json.append("  \"tables\": [\n");
        for (int index = 0; index < tables.size(); index++) {
            appendJumpTable(json, tables.get(index), 4);
            json.append(index + 1 == tables.size() ? "\n" : ",\n");
        }
        json.append("  ]\n");
        json.append("}\n");
        return new JumpTableDocumentResult(json.toString(), candidates.size(), tables.size());
    }

    private List<ComputedJumpRecord> collectComputedJumps() throws Exception {
        List<ComputedJumpRecord> candidates = new ArrayList<>();
        InstructionIterator iterator = currentProgram.getListing().getInstructions(true);
        while (iterator.hasNext()) {
            monitor.checkCancelled();
            Instruction instruction = iterator.next();
            if (
                !instruction.getFlowType().isJump() ||
                !instruction.getFlowType().isComputed()
            ) {
                continue;
            }

            Function function = findContainingFunction(instruction.getAddress());
            List<String> destinations = new ArrayList<>();
            for (Address destination : instruction.getFlows()) {
                destinations.add(formatAddress(destination));
            }
            destinations.sort(String::compareTo);
            candidates.add(
                new ComputedJumpRecord(
                    formatAddress(instruction.getAddress()),
                    function,
                    function == null ? null : formatAddress(function.getEntryPoint()),
                    instruction.toString(),
                    destinations
                )
            );
        }
        candidates.sort(Comparator.comparing(record -> record.address));
        return candidates;
    }

    private JumpTableRecord toJumpTableRecord(Function function, JumpTable jumpTable) {
        Address[] destinations = jumpTable.getCases();
        Integer[] labels = jumpTable.getLabelValues();
        List<JumpTableCaseRecord> cases = new ArrayList<>();
        for (int index = 0; index < destinations.length; index++) {
            Integer label = index < labels.length ? labels[index] : null;
            cases.add(new JumpTableCaseRecord(formatAddress(destinations[index]), label));
        }

        List<LoadTableRecord> loadTables = new ArrayList<>();
        for (JumpTable.LoadTable loadTable : jumpTable.getLoadTables()) {
            loadTables.add(
                new LoadTableRecord(
                    formatAddress(loadTable.getAddress()),
                    loadTable.getSize(),
                    loadTable.getNum()
                )
            );
        }
        loadTables.sort(Comparator.comparing(record -> record.address));

        return new JumpTableRecord(
            formatAddress(function.getEntryPoint()),
            formatAddress(jumpTable.getSwitchAddress()),
            cases,
            loadTables
        );
    }

    private void appendJumpTable(StringBuilder json, JumpTableRecord table, int indent) {
        String padding = " ".repeat(indent);
        json.append(padding).append("{\n");
        appendStringField(json, indent + 2, "functionEntry", table.functionEntry, true);
        appendStringField(json, indent + 2, "switchAddress", table.switchAddress, true);
        json.append(" ".repeat(indent + 2)).append("\"cases\": [\n");
        for (int index = 0; index < table.cases.size(); index++) {
            JumpTableCaseRecord caseRecord = table.cases.get(index);
            json.append(" ".repeat(indent + 4)).append("{\n");
            appendStringField(json, indent + 6, "destination", caseRecord.destination, true);
            if (caseRecord.label == null) {
                appendNullField(json, indent + 6, "label", false);
            }
            else {
                appendNumberField(json, indent + 6, "label", caseRecord.label, false);
            }
            json.append(" ".repeat(indent + 4)).append("}");
            json.append(index + 1 == table.cases.size() ? "\n" : ",\n");
        }
        json.append(" ".repeat(indent + 2)).append("],\n");
        json.append(" ".repeat(indent + 2)).append("\"loadTables\": [\n");
        for (int index = 0; index < table.loadTables.size(); index++) {
            LoadTableRecord loadTable = table.loadTables.get(index);
            json.append(" ".repeat(indent + 4)).append("{\n");
            appendStringField(json, indent + 6, "address", loadTable.address, true);
            appendNumberField(json, indent + 6, "entrySize", loadTable.entrySize, true);
            appendNumberField(json, indent + 6, "entryCount", loadTable.entryCount, false);
            json.append(" ".repeat(indent + 4)).append("}");
            json.append(index + 1 == table.loadTables.size() ? "\n" : ",\n");
        }
        json.append(" ".repeat(indent + 2)).append("]\n");
        json.append(padding).append("}");
    }

    private SeedDocumentResult buildSeedsDocument(String sourceSha256, List<SeedEntry> seeds) throws Exception {
        Map<String, Function> uniqueFunctions = new LinkedHashMap<>();

        for (SeedEntry seed : seeds) {
            Function containingFunction = findContainingFunction(seed.address);
            if (containingFunction != null) {
                uniqueFunctions.put(formatAddress(containingFunction.getEntryPoint()), containingFunction);
                seed.functionEntry = formatAddress(containingFunction.getEntryPoint());
            }
        }

        List<Function> sortedFunctions = new ArrayList<>(uniqueFunctions.values());
        sortedFunctions.sort(Comparator.comparing(Function::getEntryPoint));

        StringBuilder json = new StringBuilder();
        json.append("{\n");
        appendNumberField(json, 2, "schemaVersion", SCHEMA_VERSION, true);
        appendStringField(json, 2, "sourceSha256", sourceSha256, true);
        json.append("  \"seeds\": [\n");
        for (int index = 0; index < seeds.size(); index++) {
            SeedEntry seed = seeds.get(index);
            json.append("    {\n");
            appendStringField(json, 6, "label", seed.label, true);
            appendStringField(json, 6, "address", formatAddress(seed.address), true);
            if (seed.functionEntry == null) {
                appendNullField(json, 6, "functionEntry", false);
            }
            else {
                appendStringField(json, 6, "functionEntry", seed.functionEntry, false);
            }
            json.append("    }");
            json.append(index + 1 == seeds.size() ? "\n" : ",\n");
        }
        json.append("  ],\n");
        json.append("  \"functions\": [\n");

        DecompInterface decompiler = new DecompInterface();
        decompiler.toggleCCode(true);
        decompiler.toggleSyntaxTree(true);
        if (!decompiler.openProgram(currentProgram)) {
            throw new IllegalStateException("Decompiler could not open the current program");
        }

        try {
            for (int index = 0; index < sortedFunctions.size(); index++) {
                monitor.checkCancelled();
                appendSeedFunction(json, sortedFunctions.get(index), decompiler, 4);
                json.append(index + 1 == sortedFunctions.size() ? "\n" : ",\n");
            }
        }
        finally {
            decompiler.dispose();
        }

        json.append("  ]\n");
        json.append("}\n");
        return new SeedDocumentResult(json.toString(), seeds.size(), sortedFunctions.size());
    }

    private void ensureSeedFunctions(List<SeedEntry> seeds) throws Exception {
        for (SeedEntry seed : seeds) {
            if (findContainingFunction(seed.address) != null) {
                continue;
            }
            if (currentProgram.getListing().getInstructionAt(seed.address) == null) {
                throw new IllegalArgumentException(
                    "Seed does not start at an instruction and is not in a function: " +
                    formatAddress(seed.address)
                );
            }
            Function function = createFunction(seed.address, null);
            if (function == null || !function.getEntryPoint().equals(seed.address)) {
                throw new IllegalStateException(
                    "Could not create a function for seed " + formatAddress(seed.address)
                );
            }
        }
    }

    private void appendFunctionSummary(StringBuilder json, Function function, int indent) throws Exception {
        String padding = " ".repeat(indent);
        json.append(padding).append("{\n");
        appendStringField(json, indent + 2, "entry", formatAddress(function.getEntryPoint()), true);
        appendStringField(json, indent + 2, "name", function.getName(), true);
        appendStringField(json, indent + 2, "nameSource", function.getSymbol().getSource().toString(), true);
        appendStringField(
            json,
            indent + 2,
            "prototype",
            function.getPrototypeString(false, false),
            true
        );
        appendStringField(
            json,
            indent + 2,
            "callingConvention",
            nullToEmpty(function.getCallingConventionName()),
            true
        );
        appendStringField(
            json,
            indent + 2,
            "returnType",
            function.getReturnType().getDisplayName(),
            true
        );
        appendNumberField(json, indent + 2, "parameterCount", function.getParameterCount(), true);
        appendBooleanField(json, indent + 2, "external", function.isExternal(), true);
        appendBooleanField(json, indent + 2, "thunk", function.isThunk(), true);
        appendNumberField(json, indent + 2, "bodySize", function.getBody().getNumAddresses(), true);

        InstructionStats instructionStats = collectInstructionStats(function);
        appendNumberField(json, indent + 2, "instructionCount", instructionStats.count, true);
        appendStringField(json, indent + 2, "instructionSha256", instructionStats.sha256, true);

        json.append(" ".repeat(indent + 2)).append("\"bodyRanges\": [");
        appendStringArrayContents(json, collectBodyRanges(function));
        json.append("],\n");

        json.append(" ".repeat(indent + 2)).append("\"callers\": [");
        appendStringArrayContents(json, collectFunctionEntries(function.getCallingFunctions(monitor)));
        json.append("],\n");

        json.append(" ".repeat(indent + 2)).append("\"callees\": [");
        appendStringArrayContents(json, collectFunctionEntries(function.getCalledFunctions(monitor)));
        json.append("]\n");
        json.append(padding).append("}");
    }

    private void appendSeedFunction(
        StringBuilder json,
        Function function,
        DecompInterface decompiler,
        int indent
    ) throws Exception {
        String padding = " ".repeat(indent);
        json.append(padding).append("{\n");
        appendStringField(json, indent + 2, "entry", formatAddress(function.getEntryPoint()), true);
        appendStringField(json, indent + 2, "name", function.getName(), true);
        appendStringField(
            json,
            indent + 2,
            "prototype",
            function.getPrototypeString(false, false),
            true
        );
        json.append(" ".repeat(indent + 2)).append("\"bodyRanges\": [");
        appendStringArrayContents(json, collectBodyRanges(function));
        json.append("],\n");
        json.append(" ".repeat(indent + 2)).append("\"basicBlocks\": [\n");

        List<BasicBlockRecord> blocks = collectBasicBlocks(function);
        for (int index = 0; index < blocks.size(); index++) {
            BasicBlockRecord block = blocks.get(index);
            json.append(" ".repeat(indent + 4)).append("{\n");
            appendStringField(json, indent + 6, "start", block.start, true);
            appendStringField(json, indent + 6, "end", block.end, true);
            json.append(" ".repeat(indent + 6)).append("\"destinations\": [");
            appendStringArrayContents(json, block.destinations);
            json.append("]\n");
            json.append(" ".repeat(indent + 4)).append("}");
            json.append(index + 1 == blocks.size() ? "\n" : ",\n");
        }

        json.append(" ".repeat(indent + 2)).append("],\n");
        json.append(" ".repeat(indent + 2)).append("\"instructions\": [\n");

        List<InstructionRecord> instructions = collectInstructions(function);
        for (int index = 0; index < instructions.size(); index++) {
            InstructionRecord instruction = instructions.get(index);
            json.append(" ".repeat(indent + 4)).append("{\n");
            appendStringField(json, indent + 6, "address", instruction.address, true);
            appendStringField(json, indent + 6, "bytes", instruction.bytes, true);
            appendStringField(json, indent + 6, "flowType", instruction.flowType, true);
            appendStringField(json, indent + 6, "text", instruction.text, false);
            json.append(" ".repeat(indent + 4)).append("}");
            json.append(index + 1 == instructions.size() ? "\n" : ",\n");
        }

        json.append(" ".repeat(indent + 2)).append("],\n");

        DecompileResults results = decompiler.decompileFunction(
            function,
            DECOMPILE_TIMEOUT_SECONDS,
            monitor
        );
        if (!results.decompileCompleted() || results.getDecompiledFunction() == null) {
            throw new IllegalStateException(
                "Failed to decompile " + formatAddress(function.getEntryPoint()) + ": " +
                results.getErrorMessage()
            );
        }
        appendStringField(
            json,
            indent + 2,
            "decompilation",
            results.getDecompiledFunction().getC(),
            false
        );
        json.append(padding).append("}");
    }

    private List<SeedEntry> readSeedEntries(Path seedFile) throws Exception {
        List<SeedEntry> entries = new ArrayList<>();
        int lineNumber = 0;
        for (String rawLine : Files.readAllLines(seedFile, StandardCharsets.UTF_8)) {
            lineNumber++;
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }

            String[] parts = line.split("\\s+", 2);
            if (parts.length != 2 || parts[1].isBlank()) {
                throw new IllegalArgumentException(
                    "Invalid seed entry at " + seedFile + ":" + lineNumber + ": " + rawLine
                );
            }

            Address address = parseSeedAddress(parts[0]);
            if (address == null) {
                throw new IllegalArgumentException(
                    "Invalid seed address at " + seedFile + ":" + lineNumber + ": " + parts[0]
                );
            }
            entries.add(new SeedEntry(address, parts[1]));
        }

        if (entries.isEmpty()) {
            throw new IllegalArgumentException("Seed file contains no addresses: " + seedFile);
        }
        return entries;
    }

    private Address parseSeedAddress(String value) throws AddressFormatException {
        String normalized = value.startsWith("0x") || value.startsWith("0X")
            ? value.substring(2)
            : value;
        return currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(normalized);
    }

    private Function findContainingFunction(Address address) {
        Function function = currentProgram.getFunctionManager().getFunctionContaining(address);
        return function != null
            ? function
            : currentProgram.getFunctionManager().getFunctionAt(address);
    }

    private List<String> collectBodyRanges(Function function) {
        List<String> ranges = new ArrayList<>();
        AddressRangeIterator iterator = function.getBody().getAddressRanges();
        while (iterator.hasNext()) {
            AddressRange range = iterator.next();
            ranges.add(formatAddress(range.getMinAddress()) + "-" + formatAddress(range.getMaxAddress()));
        }
        return ranges;
    }

    private List<String> collectFunctionEntries(Set<Function> functions) {
        List<String> entries = new ArrayList<>();
        for (Function function : functions) {
            entries.add(formatAddress(function.getEntryPoint()));
        }
        entries.sort(String::compareTo);
        return entries;
    }

    private InstructionStats collectInstructionStats(Function function) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        InstructionIterator iterator = currentProgram.getListing().getInstructions(function.getBody(), true);
        int count = 0;
        while (iterator.hasNext()) {
            Instruction instruction = iterator.next();
            digest.update(formatAddress(instruction.getAddress()).getBytes(StandardCharsets.UTF_8));
            digest.update((byte) 0);
            digest.update(instruction.getBytes());
            count++;
        }
        return new InstructionStats(count, toHex(digest.digest()));
    }

    private List<InstructionRecord> collectInstructions(Function function) throws Exception {
        List<InstructionRecord> instructions = new ArrayList<>();
        InstructionIterator iterator = currentProgram.getListing().getInstructions(function.getBody(), true);
        while (iterator.hasNext()) {
            monitor.checkCancelled();
            Instruction instruction = iterator.next();
            instructions.add(
                new InstructionRecord(
                    formatAddress(instruction.getAddress()),
                    formatBytes(instruction.getBytes()),
                    instruction.getFlowType().getName(),
                    instruction.toString()
                )
            );
        }
        return instructions;
    }

    private List<BasicBlockRecord> collectBasicBlocks(Function function) throws Exception {
        BasicBlockModel blockModel = new BasicBlockModel(currentProgram);
        CodeBlockIterator iterator = blockModel.getCodeBlocksContaining(function.getBody(), monitor);
        List<BasicBlockRecord> blocks = new ArrayList<>();

        while (iterator.hasNext()) {
            monitor.checkCancelled();
            CodeBlock block = iterator.next();
            List<String> destinations = new ArrayList<>();
            CodeBlockReferenceIterator destinationIterator = block.getDestinations(monitor);
            while (destinationIterator.hasNext()) {
                CodeBlockReference reference = destinationIterator.next();
                destinations.add(
                    formatAddress(reference.getDestinationAddress()) + "|" +
                    reference.getFlowType().getName()
                );
            }
            destinations.sort(String::compareTo);
            blocks.add(
                new BasicBlockRecord(
                    formatAddress(block.getFirstStartAddress()),
                    formatAddress(block.getMaxAddress()),
                    destinations
                )
            );
        }

        blocks.sort(Comparator.comparing(block -> block.start));
        return blocks;
    }

    private String formatAddress(Address address) {
        long offset = address.getUnsignedOffset();
        return String.format(Locale.ROOT, "0x%08x", offset);
    }

    private String formatBytes(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 3);
        for (int index = 0; index < bytes.length; index++) {
            if (index > 0) {
                result.append(' ');
            }
            result.append(String.format(Locale.ROOT, "%02x", bytes[index] & 0xff));
        }
        return result.toString();
    }

    private String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        }
        return result.toString();
    }

    private void writeDocument(Path path, String contents) throws Exception {
        Files.writeString(
            path,
            contents,
            StandardCharsets.UTF_8,
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE
        );
    }

    private void appendStringField(
        StringBuilder json,
        int indent,
        String name,
        String value,
        boolean comma
    ) {
        json.append(" ".repeat(indent))
            .append(jsonString(name))
            .append(": ")
            .append(jsonString(value))
            .append(comma ? ",\n" : "\n");
    }

    private void appendNumberField(
        StringBuilder json,
        int indent,
        String name,
        long value,
        boolean comma
    ) {
        json.append(" ".repeat(indent))
            .append(jsonString(name))
            .append(": ")
            .append(value)
            .append(comma ? ",\n" : "\n");
    }

    private void appendBooleanField(
        StringBuilder json,
        int indent,
        String name,
        boolean value,
        boolean comma
    ) {
        json.append(" ".repeat(indent))
            .append(jsonString(name))
            .append(": ")
            .append(value)
            .append(comma ? ",\n" : "\n");
    }

    private void appendNullField(
        StringBuilder json,
        int indent,
        String name,
        boolean comma
    ) {
        json.append(" ".repeat(indent))
            .append(jsonString(name))
            .append(": null")
            .append(comma ? ",\n" : "\n");
    }

    private void appendStringArrayContents(StringBuilder json, List<String> values) {
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                json.append(", ");
            }
            json.append(jsonString(values.get(index)));
        }
    }

    private String jsonString(String value) {
        StringBuilder escaped = new StringBuilder(value.length() + 2);
        escaped.append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '"':
                    escaped.append("\\\"");
                    break;
                case '\\':
                    escaped.append("\\\\");
                    break;
                case '\b':
                    escaped.append("\\b");
                    break;
                case '\f':
                    escaped.append("\\f");
                    break;
                case '\n':
                    escaped.append("\\n");
                    break;
                case '\r':
                    escaped.append("\\r");
                    break;
                case '\t':
                    escaped.append("\\t");
                    break;
                default:
                    if (character < 0x20) {
                        escaped.append(String.format(Locale.ROOT, "\\u%04x", (int) character));
                    }
                    else {
                        escaped.append(character);
                    }
            }
        }
        escaped.append('"');
        return escaped.toString();
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static class DocumentResult {
        final String json;
        final int recordCount;

        DocumentResult(String json, int recordCount) {
            this.json = json;
            this.recordCount = recordCount;
        }
    }

    private static class JumpTableDocumentResult {
        final String json;
        final int candidateCount;
        final int tableCount;

        JumpTableDocumentResult(String json, int candidateCount, int tableCount) {
            this.json = json;
            this.candidateCount = candidateCount;
            this.tableCount = tableCount;
        }
    }

    private static class SeedDocumentResult {
        final String json;
        final int seedCount;
        final int functionCount;

        SeedDocumentResult(String json, int seedCount, int functionCount) {
            this.json = json;
            this.seedCount = seedCount;
            this.functionCount = functionCount;
        }
    }

    private static class ReferenceRecord {
        final String from;
        final String to;
        final String type;
        final String source;
        final int operandIndex;
        final boolean primary;
        final String fromFunctionEntry;
        final String fromBlock;
        final String toBlock;
        final String toSymbol;

        ReferenceRecord(
            String from,
            String to,
            String type,
            String source,
            int operandIndex,
            boolean primary,
            String fromFunctionEntry,
            String fromBlock,
            String toBlock,
            String toSymbol
        ) {
            this.from = from;
            this.to = to;
            this.type = type;
            this.source = source;
            this.operandIndex = operandIndex;
            this.primary = primary;
            this.fromFunctionEntry = fromFunctionEntry;
            this.fromBlock = fromBlock;
            this.toBlock = toBlock;
            this.toSymbol = toSymbol;
        }
    }

    private static class ComputedJumpRecord {
        final String address;
        final Function function;
        final String functionEntry;
        final String instruction;
        final List<String> destinations;

        ComputedJumpRecord(
            String address,
            Function function,
            String functionEntry,
            String instruction,
            List<String> destinations
        ) {
            this.address = address;
            this.function = function;
            this.functionEntry = functionEntry;
            this.instruction = instruction;
            this.destinations = destinations;
        }
    }

    private static class JumpTableRecord {
        final String functionEntry;
        final String switchAddress;
        final List<JumpTableCaseRecord> cases;
        final List<LoadTableRecord> loadTables;

        JumpTableRecord(
            String functionEntry,
            String switchAddress,
            List<JumpTableCaseRecord> cases,
            List<LoadTableRecord> loadTables
        ) {
            this.functionEntry = functionEntry;
            this.switchAddress = switchAddress;
            this.cases = cases;
            this.loadTables = loadTables;
        }
    }

    private static class JumpTableCaseRecord {
        final String destination;
        final Integer label;

        JumpTableCaseRecord(String destination, Integer label) {
            this.destination = destination;
            this.label = label;
        }
    }

    private static class LoadTableRecord {
        final String address;
        final int entrySize;
        final int entryCount;

        LoadTableRecord(String address, int entrySize, int entryCount) {
            this.address = address;
            this.entrySize = entrySize;
            this.entryCount = entryCount;
        }
    }

    private static class SeedEntry {
        final Address address;
        final String label;
        String functionEntry;

        SeedEntry(Address address, String label) {
            this.address = address;
            this.label = label;
        }
    }

    private static class InstructionStats {
        final int count;
        final String sha256;

        InstructionStats(int count, String sha256) {
            this.count = count;
            this.sha256 = sha256;
        }
    }

    private static class InstructionRecord {
        final String address;
        final String bytes;
        final String flowType;
        final String text;

        InstructionRecord(String address, String bytes, String flowType, String text) {
            this.address = address;
            this.bytes = bytes;
            this.flowType = flowType;
            this.text = text;
        }
    }

    private static class BasicBlockRecord {
        final String start;
        final String end;
        final List<String> destinations;

        BasicBlockRecord(String start, String end, List<String> destinations) {
            this.start = start;
            this.end = end;
            this.destinations = destinations;
        }
    }
}
