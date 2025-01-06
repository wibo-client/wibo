const path = require('path');
const nodeExternals = require('webpack-node-externals');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: {
    yuqueIndexHandlerImpl: './src/plugins/yuqueIndexHandlerImpl.mjs'
  },
  target: 'node', // 目标环境为 Node.js
  output: {
    path: path.resolve(__dirname, 'dist/plugins'),
    filename: '[name].js', // 输出文件名为 .js
    libraryTarget: 'commonjs2' // 导出为 CommonJS 模块
  },
  resolve: {
    extensions: ['.js', '.mjs'],
    alias: {
      '@components': path.resolve(__dirname, 'src/component')
    }
  },
  externals: [nodeExternals()], // 排除 node_modules 依赖
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  devtool: 'source-map', // 启用源映射
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/plugins/*.json', to: '[name][ext]' }
      ]
    })
  ]
};