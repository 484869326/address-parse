// // 引入 zh-address-parse 库
import AddressParse from './dist/address-parse.min.js';

// 示例地址
const address = '刘海江13311111111河南省省直辖县级行政区划济源市沁园路丹尼斯';

// 解析地址
const result = AddressParse(address);
console.log('解析结果：', result);

// import addressJson from './provinceList.json' assert { type: 'json' };

// const cities = addressJson.reduce((per, cur) => {
//     return per.concat(cur.children ? cur.children.map(({ children, ...others }) => ({ ...others, provinceCode: cur.code, areaCode: others.code })) : [])
// }, [])
// console.log('lzj', cities);