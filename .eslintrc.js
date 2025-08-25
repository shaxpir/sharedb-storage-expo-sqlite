module.exports = {
  'extends': ['google'],
  'env':     {
    'node':    true,
    'browser': true,
    'es6':     true,
    'mocha':   true,
  },
  'parserOptions': {
    'ecmaVersion': 2018,
    'sourceType':  'module',
  },
  'rules': {
    // Disable some overly strict Google rules for ShareDB compatibility
    'max-len':                 ['error', {'code': 120, 'ignoreUrls': true, 'ignoreComments': true}],
    'require-jsdoc':           'off',
    'valid-jsdoc':             'off',
    'no-multi-spaces':         ['error', {'ignoreEOLComments': true}],
    'key-spacing':             ['error', {'align': 'value'}],
    'no-multiple-empty-lines': ['error', {'max': 2, 'maxEOF': 1, 'maxBOF': 0}],

    // Allow ShareDB patterns
    'no-invalid-this':       'off',
    'guard-for-in':          'off',
    'no-prototype-builtins': 'off',
    'prefer-rest-params':    'off',
    'prefer-spread':         'off',
  },
  'globals': {
    // Test globals
    'describe':   'readonly',
    'it':         'readonly',
    'before':     'readonly',
    'beforeEach': 'readonly',
    'after':      'readonly',
    'afterEach':  'readonly',
  },
};
