const path = require('path');

module.exports = {
    mode: 'production',
    entry: './address-parse.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        library: {
            name: 'AddressParse',
            type: 'umd',
            export: 'default'
        },
        globalObject: 'this'
    },
    experiments: {
        topLevelAwait: true
    },
    module: {
        rules: [
            {
                test: /\.json$/,
                type: 'json'
            }
        ]
    }
}; 