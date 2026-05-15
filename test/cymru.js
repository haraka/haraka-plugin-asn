const assert = require('node:assert/strict')
const path = require('node:path')
const { describe, it } = require('node:test')

const fixtures = require('haraka-test-fixtures')

describe('parse_cymru', () => {
  const plugin = new fixtures.plugin('asn')
  plugin.config = plugin.config.module_config(path.resolve('test'))
  plugin.load_asn_ini()

  const cases = [
    {
      input: '40431 | 208.75.176.0/21 | US | arin | 2007-03-02',
      expected: {
        asn: '40431',
        net: '208.75.176.0/21',
        country: 'US',
        assignor: 'arin',
        date: '2007-03-02',
      },
      desc: 'full record with date',
    },
    {
      input: '10290 | 12.129.48.0/24 | US | arin |',
      expected: {
        asn: '10290',
        net: '12.129.48.0/24',
        country: 'US',
        assignor: 'arin',
        date: '',
      },
      desc: 'missing date field',
    },
    {
      input: 'too | short',
      expected: undefined,
      desc: 'too few fields returns undefined',
    },
  ]

  for (const { input, expected, desc } of cases) {
    it(desc, () => {
      assert.deepEqual(plugin.parse_cymru(input), expected)
    })
  }
})
