const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  mode: 'development',
  entry: {
    main: './src/main.mjs',
    preload: './src/preload.mjs' // 添加 preload 入口点
  },
  target: 'electron-main',
  externals: [nodeExternals()],
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.js', '.mjs']
  },
  devtool: 'source-map', // 启用源映射
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-spread']
          }
        }
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      __dirname: JSON.stringify(path.resolve(__dirname, 'dist'))
    })
  ]
};