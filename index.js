// // 引入 zh-address-parse 库
import AddressParse from './dist/index.min.js';

// 示例地址
const address = '王晓光 万州区 太平镇，13311111111';

// 解析地址
const result = AddressParse(address);
console.log('解析结果：', result);

// import addressJson from './provinceList.json' assert { type: 'json' };

// const cities = addressJson.reduce((per, cur) => {
//     return per.concat(cur.children ? cur.children.map(({ children, ...others }) => ({ ...others, provinceCode: cur.code, areaCode: others.code })) : [])
// }, [])
// console.log('lzj', cities);