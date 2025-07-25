# Chinese Address Parser

这是一个基于 [zh-address-parse](https://github.com/ldwonday/zh-address-parse ) 的中国地址解析工具的修改版本。

## 主要改动

- 数据源改用微信小程序的行政区划数据
- 特殊处理了重庆市下的县级行政区（区别于原始数据）
- 新增返回省市区的行政区划代码（provinceCode、cityCode、areaCode）

## 数据来源

- `provinceList.json`: 中国行政区划数据(微信小程序的)
- `names.json`: 中文姓名识别库

## 致谢

本项目基于 [zh-address-parse](https://github.com/ldwonday/zh-address-parse) 进行开发和改进。感谢原作者的贡献。

## License

MIT 