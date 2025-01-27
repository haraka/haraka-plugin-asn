# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/).

### Unreleased

### [2.0.4] - 2025-01-26

- dep(eslint): upgrade to v9


### [2.0.3] - 2023-12-13

- ci: use shared ci workflows
- confirm maxmind db has loaded before registering hook #23
- populate [files] in package.json
- dep: eslint-plugin-haraka -> @haraka/eslint-config
- lint: remove duplicate / stale rules from .eslintrc
- doc: renamed Changes.md -> CHANGELOG.md

### 2.0.2 - 2023-02-07

- fix: catching DNS timeout exception

### 2.0.1 - 2022-05-27

- fix: when adding headers, assure ASN is string
- fix: when adding header, look in correct location for asn.org
- when create conn note, only assign properties with values

### 2.0.0 - 2022-05-23

- style: replace most callbacks with async/await
- use builtin/promises where available
- asn.ini: switch default dns provider to rspamd
- dep: remove async

### 1.0.9 - 2022-05-22

- ci: add GitHub Actions CI, #17
- ci: remove appveyor and travis configs
- lint: prefer-template
- test: wait longer for dns test
- style: more es6/7
- dep(async): bump version to 3.2

### 1.0.8 - 2018-01-22

- parse maxmind ASN w/o Org data
- es6: var => const|let, function () => arrow functions
- provide ASN lookups from maxmind DBs for IPv6 addrs
- added parse_rspamd test
- emit rspamd DNS provider results (when enabled)

### 1.0.7 - 2017-02-06

- updated eslint to use eslint-plugin-haraka
- aggregate results before emitting

### 1.0.6 - 2016-10-20

- when protocols[setting]=false, don't enable that protocol
  - ie, do what the config implies

### 1.0.5 - 2016-10-08

### 1.0.4 - 2016-10-08

### 1.0.2 - 2016-10-06

### 1.0.1 - 2016-02-07

### 1.0.0 - 2016-07-21

[1.0.9]: https://github.com/haraka/haraka-plugin-asn/releases/tag/v1.0.9
[2.0.0]: https://github.com/haraka/haraka-plugin-asn/releases/tag/v2.0.0
[2.0.1]: https://github.com/haraka/haraka-plugin-asn/releases/tag/2.0.1
[2.0.2]: https://github.com/haraka/haraka-plugin-asn/releases/tag/v2.0.2
[2.0.3]: https://github.com/haraka/haraka-plugin-asn/releases/tag/2.0.3
[2.0.4]: https://github.com/haraka/haraka-plugin-asn/releases/tag/v2.0.4
