const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const path = require('node:path')

const fixtures = require('haraka-test-fixtures')

describe('parse_monkey', () => {
  const plugin = new fixtures.plugin('asn')
  plugin.config = plugin.config.module_config(path.resolve('test'))
  plugin.load_asn_ini()

  const cases = [
    {
      input: '74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30',
      expected: {
        net: '74.125.44.0/23',
        asn: '15169',
        org: 'Google Inc.',
        date: '2000-03-30',
        country: undefined,
      },
      desc: 'parses AS 15169/23',
    },
    {
      input: '74.125.0.0/16 | AS15169 | Google Inc. | 2000-03-30 | US',
      expected: {
        net: '74.125.0.0/16',
        asn: '15169',
        org: 'Google Inc.',
        date: '2000-03-30',
        country: 'US',
      },
      desc: 'parses AS 15169/16',
    },
    {
      input: 'net | AS15169',
      expected: undefined,
      desc: 'too few fields returns undefined',
    },
  ]

  for (const { input, expected, desc } of cases) {
    it(desc, () => {
      assert.deepEqual(plugin.parse_monkey(input), expected)
    })
  }
})
