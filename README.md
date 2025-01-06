# wibo 
围脖 wibo 个人提效工具。

一个完全开放的，客户端的，检索增强工具。

你只需要通过wibo来提问，会由大模型在你的本机构建搜索语句并查询对应的网站平台，获取信息后总结。
解决现有的 检索增强 比如豆包 智谱等网站 内容范围过窄和不准确的问题。


已经接入 百度 ， 必应 等既有的搜索引擎。

--
Wibo: Personal Efficiency Tool

A completely open, client-side, search enhancement tool.

You just need to ask questions through Wibo, and the large model will construct search queries on your local machine, query the corresponding websites, and summarize the information.
This solves the problem of narrow and inaccurate content range in existing search enhancement tools like Doubao and Zhipu.

It has already integrated existing search engines like Baidu and Bing.

# 怎么用？
目前是一个Node electron 客户端。

二进制下载

或

下载源码 
前端是一个Electron代码。

进入frontend:

npm install build 
npm run 即可。


后端是java代码。

进入java-local-server
mvn package 


启动等我链接一下


-- 
Currently, this is a Node Electron client.

Binary Download

or

Download the source code
npm install build
npm run

## License

本软件是双协议版本软件。 
软件本体遵循GPLV3协议，也即如果你自己用这个产品，那么完全免费开源，随意使用。
但如果你要对本产品做商业分发（也即依托本产品的代码做的软件二次开发然后打包允许别人下载或付费），则您的软件源码也必须开源。 

开源 也即 我为人人 人人为我 。 请您遵循该协议 。 

This project is dual-licensed under the following licenses:

1. **GNU General Public License v3.0 (GPLv3)**: See the [LICENSE](./LICENSE) file for details.
2. **Commercial License**: For commercial use, please see the [COMMERCIAL_LICENSE](./COMMERCIAL_LICENSE.md) file for details.