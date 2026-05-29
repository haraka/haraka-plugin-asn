'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const { makePlugin } = require('haraka-test-fixtures')

describe('parse_routeviews', () => {
  const plugin = makePlugin('asn', { configDir: 'test' })
  plugin.load_asn_ini()

  const cases = [
    { input: '40431', expected: undefined, desc: 'asn-only string returns undefined' },
    {
      input: ['40431', 'only'],
      expected: undefined,
      desc: 'two-element array returns undefined',
    },
    {
      input: '40431 208.75.176.0 21',
      expected: { asn: '40431', net: '208.75.176.0/21' },
      desc: 'space-separated string',
    },
    {
      input: '15169,8.8.8.0,24',
      expected: { asn: '15169', net: '8.8.8.0/24' },
      desc: 'CSV string',
    },
    {
      input: ['40431', '208.75.176.0', '21'],
      expected: { asn: '40431', net: '208.75.176.0/21' },
      desc: 'array',
    },
    {
      input: ['15169', '8.8.8.0', '24'],
      expected: { asn: '15169', net: '8.8.8.0/24' },
      desc: 'array AS15169',
    },
  ]

  for (const { input, expected, desc } of cases) {
    it(desc, () => {
      assert.deepEqual(plugin.parse_routeviews(input), expected)
    })
  }
})
