const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  devServer: {
    static: './src',
    port: 8080
  },
  module: {
    rules: [
      {
        test: /\.(png|json)$/,
        type: 'asset/resource'
      }
    ]
  }
};
