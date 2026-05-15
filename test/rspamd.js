const assert = require('node:assert/strict')
const path = require('node:path')
const { describe, it } = require('node:test')

const fixtures = require('haraka-test-fixtures')

describe('parse_rspamd', () => {
  const plugin = new fixtures.plugin('asn')
  plugin.config = plugin.config.module_config(path.resolve('test'))
  plugin.load_asn_ini()

  const cases = [
    {
      input: '15169|8.8.8.0/24|US|arin|',
      expected: {
        asn: '15169',
        net: '8.8.8.0/24',
        country: 'US',
        assignor: 'arin',
        date: '',
      },
      desc: 'Google AS15169, no date',
    },
    {
      input: '13335|1.1.1.0/24|AU|apnic|2011-08-11',
      expected: {
        asn: '13335',
        net: '1.1.1.0/24',
        country: 'AU',
        assignor: 'apnic',
        date: '2011-08-11',
      },
      desc: 'Cloudflare AS13335, with date',
    },
    {
      input: 'too|short',
      expected: undefined,
      desc: 'too few fields returns undefined',
    },
  ]

  for (const { input, expected, desc } of cases) {
    it(desc, () => {
      assert.deepEqual(plugin.parse_rspamd(input), expected)
    })
  }
})
