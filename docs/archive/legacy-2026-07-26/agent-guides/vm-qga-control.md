Archived VM/QGA control guidance:
  - This file preserves pre-2026-07-26 guidance and is not current project policy.

VM/QGA control:
  - Use only `/home/bluboks/.local/bin/win10-qga` for VM/QGA control.
  - Do not wrap VM commands with `bash -lc`, `/bin/bash -lc`, `sh -c`, pipes, redirects, shell vars,
  command substitution, raw `virsh`, or raw QGA.
  - If approval is needed, request prefix_rule exactly:
    `["/home/bluboks/.local/bin/win10-qga"]`
  - Only clean processes launched by this agent and only via explicit markers.
  - Do not touch other agents' VM or host processes.
  - Mark any browser/dev-server/game/tool process launched by this agent so it can be cleaned later.
  - When running a copied `.ps1` analysis helper through `exec-powershell` or `exec-powershell-interactive`, include
    `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force;` before invoking the helper. VM policy can
    block script-file execution before helper-level logging starts.
