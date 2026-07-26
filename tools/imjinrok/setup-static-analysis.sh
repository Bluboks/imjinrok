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
download_directory="${analysis_cache_root}/downloads"
installation_directory="${analysis_cache_root}/installations"
lock_file="${analysis_cache_root}/setup.lock"

mkdir -p -- "${download_directory}" "${installation_directory}"
exec 9>"${lock_file}"
flock 9

verify_checksum() {
  local expected_checksum="$1"
  local file_path="$2"
  local actual_checksum

  actual_checksum="$(sha256sum -- "${file_path}" | cut -d ' ' -f 1)"
  if [[ "${actual_checksum}" != "${expected_checksum}" ]]; then
    printf 'Checksum mismatch for %s\nexpected: %s\nactual:   %s\n' \
      "${file_path}" "${expected_checksum}" "${actual_checksum}" >&2
    return 1
  fi
}

download_archive() {
  local archive_url="$1"
  local expected_checksum="$2"
  local destination_path="$3"
  local partial_path="${destination_path}.part"
  local invalid_path

  if [[ -f "${destination_path}" ]]; then
    verify_checksum "${expected_checksum}" "${destination_path}"
    return
  fi

  printf 'Downloading %s\n' "${archive_url}"
  curl \
    --fail \
    --location \
    --retry 3 \
    --retry-delay 2 \
    --continue-at - \
    --output "${partial_path}" \
    "${archive_url}"

  if ! verify_checksum "${expected_checksum}" "${partial_path}"; then
    invalid_path="${partial_path}.invalid"
    mv -- "${partial_path}" "${invalid_path}"
    printf 'Preserved invalid download at %s\n' "${invalid_path}" >&2
    exit 1
  fi

  mv -- "${partial_path}" "${destination_path}"
}

install_jdk() {
  local archive_path="${download_directory}/${JDK_ARCHIVE}"
  local target_path="${installation_directory}/${JDK_EXTRACTED_DIR}"
  local staging_path

  download_archive "${JDK_URL}" "${JDK_SHA256}" "${archive_path}"

  if [[ ! -d "${target_path}" ]]; then
    staging_path="$(mktemp -d "${installation_directory}/.jdk-staging.XXXXXX")"
    tar -xzf "${archive_path}" -C "${staging_path}"
    if [[ ! -x "${staging_path}/${JDK_EXTRACTED_DIR}/bin/java" ]]; then
      printf 'JDK archive did not contain expected directory: %s\n' "${JDK_EXTRACTED_DIR}" >&2
      exit 1
    fi
    mv -- "${staging_path}/${JDK_EXTRACTED_DIR}" "${target_path}"
    rmdir -- "${staging_path}"
  fi

  if [[ ! -x "${target_path}/bin/java" ]]; then
    printf 'JDK installation is incomplete: %s\n' "${target_path}" >&2
    exit 1
  fi

  "${target_path}/bin/java" -version 2>&1 | head -n 1
}

install_ghidra() {
  local archive_path="${download_directory}/${GHIDRA_ARCHIVE}"
  local target_path="${installation_directory}/${GHIDRA_EXTRACTED_DIR}"
  local staging_path

  download_archive "${GHIDRA_URL}" "${GHIDRA_SHA256}" "${archive_path}"

  if [[ ! -d "${target_path}" ]]; then
    staging_path="$(mktemp -d "${installation_directory}/.ghidra-staging.XXXXXX")"
    unzip -q "${archive_path}" -d "${staging_path}"
    if [[ ! -x "${staging_path}/${GHIDRA_EXTRACTED_DIR}/support/analyzeHeadless" ]]; then
      printf 'Ghidra archive did not contain expected directory: %s\n' "${GHIDRA_EXTRACTED_DIR}" >&2
      exit 1
    fi
    mv -- "${staging_path}/${GHIDRA_EXTRACTED_DIR}" "${target_path}"
    rmdir -- "${staging_path}"
  fi

  if [[ ! -x "${target_path}/support/analyzeHeadless" ]]; then
    printf 'Ghidra installation is incomplete: %s\n' "${target_path}" >&2
    exit 1
  fi
}

install_jdk
install_ghidra

jdk_home="${installation_directory}/${JDK_EXTRACTED_DIR}"
ghidra_home="${installation_directory}/${GHIDRA_EXTRACTED_DIR}"

printf 'Static-analysis toolchain is ready.\n'
printf 'repository:  %s\n' "${repository_root}"
printf 'cache:       %s\n' "${analysis_cache_root}"
printf 'JAVA_HOME:   %s\n' "${jdk_home}"
printf 'GHIDRA_HOME: %s\n' "${ghidra_home}"
