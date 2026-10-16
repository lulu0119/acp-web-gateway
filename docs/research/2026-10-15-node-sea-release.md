# Node single executables for a six-target release

Status: consumed by [ADR 0017](../adr/0017-the-daemon-ships-as-one-executable.md).

Researched 2026-10-15 for [ADR 0017](../adr/0017-the-daemon-ships-as-one-executable.md). Links are pinned to commits.

## Node

- `--build-sea` (built-in injection, no postject) first shipped in v25.5.0 ([doc history](https://github.com/nodejs/node/blob/26e72d85a611e222e3f06025de8a3c496923bacd/doc/api/single-executable-applications.md#L9-L12)). An ES module entry, `"mainFormat": "module"`, first shipped in v25.7.0 ([CHANGELOG_V25](https://github.com/nodejs/node/blob/38aa1f38819029593ea0c5e0fe6658f1dabd6683/doc/changelogs/CHANGELOG_V25.md#L364-L369)). Node 24 LTS documents CommonJS only ([v24.22.0](https://github.com/nodejs/node/blob/f14cd3aa7bf9ca8df2cc5b8bb14beb0f335b1d93/doc/api/single-executable-applications.md#L32)). v25 reached end of life on 2026-06-01, and v26 becomes LTS on 2026-10-28 ([schedule](https://github.com/nodejs/Release/blob/72fdab20216c5f04e0a0fe72a225c2504e9f2b42/schedule.json#L141-L152)).
- The Node that builds the blob must be the version it is injected into ([doc](https://github.com/nodejs/node/blob/26e72d85a611e222e3f06025de8a3c496923bacd/doc/api/single-executable-applications.md#L129-L132)). Building for another platform needs `useCodeCache` and `useSnapshot` off ([doc](https://github.com/nodejs/node/blob/26e72d85a611e222e3f06025de8a3c496923bacd/doc/api/single-executable-applications.md#L134-L139)).
- Intel Macs are not supported: the doc lists macOS arm64 only ([doc](https://github.com/nodejs/node/blob/26e72d85a611e222e3f06025de8a3c496923bacd/doc/api/single-executable-applications.md#L762-L775)), and `--build-sea` output segfaults there ([nodejs/node#62893](https://github.com/nodejs/node/issues/62893)).
- After building on macOS, sign ad hoc with `codesign --sign -` ([doc](https://github.com/nodejs/node/blob/26e72d85a611e222e3f06025de8a3c496923bacd/doc/api/single-executable-applications.md#L70-L75)). Apple silicon runs any signed executable, and "a simple ad-hoc signature is sufficient" ([Big Sur 11.0.1 release notes](https://developer.apple.com/documentation/macos-release-notes/macos-big-sur-11_0_1-universal-apps-release-notes)). Gatekeeper checks only quarantined files, which a browser download is and a Homebrew formula install is not ([Homebrew docs](https://github.com/Homebrew/brew/blob/f8d1b25f33e032707f151123aca0eac3a239c676/docs/Homebrew-Security-and-Supply-Chain.md#L215-L221)).

## Projects

- **pnpm 11** builds every target on one macOS arm64 runner by pointing `executable` at each target's Node, pinned to Node 26, and ships no darwin-x64 after 11.0.3 crashed on Intel ([build-artifacts.ts](https://github.com/pnpm/pnpm/blob/3a1a9b17974cfb689f990a976bbda23acd73fcac/pnpm11/pnpm/artifacts/exe/scripts/build-artifacts.ts#L10-L28), [packApp.ts](https://github.com/pnpm/pnpm/blob/3a1a9b17974cfb689f990a976bbda23acd73fcac/pnpm11/releasing/commands/src/pack-app/packApp.ts#L254-L312)).
- **t3code** uses tsdown's `exe` option on one native runner per target, including `ubuntu-24.04-arm` and `windows-11-arm`, and skips Intel macOS ([release.yml](https://github.com/pingdotgg/t3code/blob/339179f50a84dc599cce373dbb48f172f182f44e/.github/workflows/release.yml#L561-L690)).
- **tsdown `exe`** wraps `--build-sea`, needs Node 25.7 or later, and always builds with the host Node, so the host must match the target version ([exe.ts](https://github.com/rolldown/tsdown/blob/b46c0d4e9c8ec7673702040c289871448248f178/src/features/exe.ts#L239-L241)).

## Size

Measured: stripping the official Linux x64 Node before injecting takes the executable from 150.6 MB to 117.3 MB (41 MB gzipped). UPX breaks single executables ([postject#87](https://github.com/nodejs/postject/issues/87)).

## Runners

`ubuntu-24.04-arm` and `windows-11-arm` are free for public repositories ([github/docs](https://github.com/github/docs/blob/0226a2d78cf2be40ee3d769ec5661638461af0cc/data/reusables/actions/supported-github-runners.md#L51-L64)). `macos-13` is gone; `macos-15-intel` is the last Intel image and ends in August 2027 ([runner-images#13045](https://github.com/actions/runner-images/issues/13045)).
