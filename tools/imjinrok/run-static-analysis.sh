#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_directory}/../.." && pwd)"
versions_file="${script_directory}/static-analysis-versions.env"

if [[ ! -f "${versions_file}" ]]; then
  printf 'Missing static-analysis version manifest: %s\n' "${versions_file}" >&2
  exit 1
fi

# shellcheck source=static-analysis-versions.env
source "${versions_file}"

analysis_cache_root="${IMJINROK_ANALYSIS_CACHE:-${XDG_CACHE_HOME:-${HOME}/.cache}/imjinrok-static-analysis}"
installation_directory="${analysis_cache_root}/installations"
jdk_home="${installation_directory}/${JDK_EXTRACTED_DIR}"
ghidra_home="${installation_directory}/${GHIDRA_EXTRACTED_DIR}"
project_directory="${IMJINROK_GHIDRA_PROJECTS:-${TMPDIR:-/tmp}/imjinrok-static-analysis-projects}"

input_argument="${1:-original/imjinrok2/imjinrok2.exe}"
output_argument="${2:-analysis/generated/imjinrok2}"
seed_argument="${3:-analysis/config/seed-addresses.txt}"

input_path="$(realpath -e -- "${repository_root}/${input_argument}")"
seed_path="$(realpath -e -- "${repository_root}/${seed_argument}")"
output_path="$(realpath -m -- "${repository_root}/${output_argument}")"
output_parent="$(dirname -- "${output_path}")"

"${script_directory}/setup-static-analysis.sh"

if [[ ! -x "${jdk_home}/bin/java" ]]; then
  printf 'JDK is unavailable after setup: %s\n' "${jdk_home}" >&2
  exit 1
fi

if [[ ! -x "${ghidra_home}/support/analyzeHeadless" ]]; then
  printf 'Ghidra is unavailable after setup: %s\n' "${ghidra_home}" >&2
  exit 1
fi

source_sha256="$(sha256sum -- "${input_path}" | cut -d ' ' -f 1)"
expected_sha256="25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e"
if [[ "${source_sha256}" != "${expected_sha256}" ]]; then
  printf 'Refusing to analyze an unexpected executable.\nexpected: %s\nactual:   %s\nfile:     %s\n' \
    "${expected_sha256}" "${source_sha256}" "${input_path}" >&2
  exit 1
fi

mkdir -p -- "${output_parent}" "${project_directory}"
staging_path="$(mktemp -d "${output_parent}/.imjinrok2-analysis.XXXXXX")"
project_name="imjinrok2-${source_sha256:0:12}-$$"

cleanup_staging() {
  if [[ -d "${staging_path}" && "${staging_path}" == "${output_parent}"/.imjinrok2-analysis.* ]]; then
    rm -rf -- "${staging_path}"
  fi
}
trap cleanup_staging EXIT

export JAVA_HOME="${jdk_home}"
export PATH="${jdk_home}/bin:${PATH}"

"${ghidra_home}/support/analyzeHeadless" \
  "${project_directory}" \
  "${project_name}" \
  -import "${input_path}" \
  -overwrite \
  -analysisTimeoutPerFile 1800 \
  -scriptPath "${script_directory}/ghidra" \
  -postScript ExportImjinrokAnalysis.java \
    "${staging_path}" \
    "${source_sha256}" \
    "${seed_path}" \
    "original/imjinrok2/imjinrok2.exe" \
  -deleteProject

(
  cd -- "${staging_path}"
  sha256sum \
    manifest.json \
    functions.json \
    strings.json \
    references.json \
    jump-tables.json \
    seeds.json \
    > SHA256SUMS
)

node "${script_directory}/validate-static-analysis.mjs" --input "${staging_path}"

mkdir -p -- "${output_path}"
for generated_file in \
  manifest.json \
  functions.json \
  strings.json \
  references.json \
  jump-tables.json \
  seeds.json \
  SHA256SUMS
do
  install -m 0644 -- "${staging_path}/${generated_file}" "${output_path}/${generated_file}"
done

printf 'Static analysis generated at %s\n' "${output_path}"
