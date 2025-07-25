const zhCnNames = require('./names.json');
const addressJson = require('./provinceList.json');

// Special handling for SAR (Special Administrative Regions)
const isSpecialAdministrativeRegion = (provinceName) => {
    return provinceName === '香港特别行政区' || provinceName === '澳门特别行政区';
}

const provinces = addressJson.reduce((per, cur) => {
    const { children, ...others } = cur
    return per.concat(others)
}, [])

const cities = addressJson.reduce((per, cur) => {
    return per.concat(cur.children ? cur.children.map(({ children, ...others }) => ({ ...others, provinceCode: cur.code })) : [])
}, [])

const areas = addressJson.reduce((per, cur) => {
    const provinceCode = cur.code
    return per.concat(cur.children ? cur.children.reduce((p, c) => {
        const cityCode = c.code
        return p.concat(c.children ? c.children.map(({ children, ...others }) => ({ ...others, cityCode, provinceCode, })) : [])
    }, []) : [])
}, [])

// 为特别行政区添加特殊处理
const sarAreas = addressJson.reduce((per, cur) => {
    if (isSpecialAdministrativeRegion(cur.name)) {
        const provinceCode = cur.code;
        const cityCode = cur.children[0].code;
        return per.concat(cur.children[0].children.map(area => ({
            code: area.code,
            name: area.name,
            cityCode,
            provinceCode
        })));
    }
    return per;
}, []);

// 将特别行政区的区域添加到areas中
areas.push(...sarAreas);

let provinceString = JSON.stringify(provinces)
let cityString = JSON.stringify(cities)
let areaString = JSON.stringify(areas)

/**
 * 需要解析的地址，type是解析的方式，默认是正则匹配
 * @param address
 * @param options?：type： 0:正则，1：树查找, textFilter： 清洗的字段
 * @returns {{}|({area: Array, province: Array, phone: string, city: Array, name: string, detail: Array} & {area: (*|string), province: (*|string), city: (*|string), detail: (Array|boolean|string|string)})}
 * @constructor
 */
const AddressParse = (address, options) => {
    const { type = 0, extraGovData = {}, textFilter = [], nameMaxLength = 4 } = typeof options === 'object' ? options : (typeof options === 'number' ? { type: options } : {})

    if (!address) {
        return {}
    }

    setExtraGovData(extraGovData);

    const parseResult = {
        phone: '',
        province: [],
        city: [],
        area: [],
        detail: [],
        name: '',
    }
    address = cleanAddress(address, textFilter)

    // 识别手机号
    const resultPhone = filterPhone(address)
    address = resultPhone.address
    parseResult.phone = resultPhone.phone

    const resultCode = filterPostalCode(address)
    address = resultCode.address
    parseResult.postalCode = resultCode.postalCode

    // 地址分割，排序
    let splitAddress = address.split(' ').filter(item => item && !/^\d+$/.test(item)).map(item => item.trim());
    // 这里先不排序了，排序可能出现问题，比如：北京 北京市
    splitAddress = sortAddress(splitAddress)

    // 找省市区和详细地址
    splitAddress.forEach((item, index) => {
        // 识别地址
        if (!parseResult.province[0] || !parseResult.city[0] || !parseResult.area[0]) {
            // 两个方法都可以解析，正则和树查找
            let parse = {}
            type === 1 && (parse = parseRegion(item, parseResult))
            type === 0 && (parse = parseRegionWithRegexp(item, parseResult))
            const { province, city, area, detail } = parse
            parseResult.province = province || []
            parseResult.area = area || []
            parseResult.city = city || []
            parseResult.detail = parseResult.detail.concat(detail || [])
            parseResult.areaCode = parseResult.area[0]?.code || ''
        } else {
            parseResult.detail.push(item)
        }
    })

    const province = parseResult.province[0]
    const city = parseResult.city[0]
    const area = parseResult.area[0]
    let detail = parseResult.detail

    detail = detail.map(item => item.replace(new RegExp(`${province && province.name}|${city && city.name}|${area && area.name}`, 'g'), ''))
    detail = Array.from(new Set(detail))

    // 地址都解析完了，姓名应该是在详细地址里面
    if (detail && detail.length > 0) {
        const copyDetail = [...detail].filter(item => !!item)
        copyDetail.sort((a, b) => a.length - b.length)

        // 如果文本中包含括号，不应该被识别为名字
        const index = copyDetail.findIndex(item => {
            // 如果包含括号，不是名字
            if (/[（(][^）)]*[）)]/.test(item)) {
                return false;
            }
            return judgeFragmentIsName(item, nameMaxLength);
        });

        let name = ''
        if (~index) {
            name = copyDetail[index]
        } else if (copyDetail[0] && copyDetail[0].length <= nameMaxLength && /[\u4E00-\u9FA5]/.test(copyDetail[0]) && !/[（(][^）)]*[）)]/.test(copyDetail[0])) {
            name = copyDetail[0]
        }

        // 找到了名字就从详细地址里面删除它
        if (name) {
            parseResult.name = name
            detail.splice(detail.findIndex(item => item === name), 1)
        }
    }

    const provinceName = province && province.name
    let cityName = city && city.name

    // 重庆市下的县级行政区是在"县"下面，所以需要特殊处理
    if (provinceName === '重庆市') {
        // 如果区域代码以5002开头，说明是县级市
        if (area && area.code && area.code.startsWith('5002')) {
            cityName = '县'
            // 从详细地址中移除可能被错误添加的"县"前缀
            if (detail && detail.length > 0) {
                detail = detail.map(item => item.replace(/^县/, ''))
            }
        }
    } else if (~['市辖区', '区', '县', '镇'].indexOf(cityName)) {
        cityName = provinceName
    }

    return Object.assign(parseResult, {
        province: provinceName || '',
        city: cityName || '',
        area: (area && area.name) || '',
        detail: (detail && detail.length > 0 && detail.join('')) || '',
        provinceCode: province && province.code || '',
        cityCode: city && city.code || ''
    })
}

/**
 * 设置额外的国家地理信息
 * @param extraGovData
 */
const setExtraGovData = (extraGovData) => {
    const { province, city, area } = extraGovData;
    if (province) {
        provinces.push(...province);
        provinceString = JSON.stringify(provinces);
    }

    if (province) {
        cities.push(...city);
        cityString = JSON.stringify(cities);
    }

    if (province) {
        areas.push(...area);
        areaString = JSON.stringify(areas);
    }
}

/**
 * 按照省市区县镇排序
 * @param splitAddress
 * @returns {*[]}
 */
const sortAddress = (splitAddress) => {
    const result = [];
    const getIndex = (str) => {
        return splitAddress.findIndex(item => ~item.indexOf(str))
    }
    ['省', '市', '区', '县', '镇'].forEach(item => {
        let index = getIndex(item)
        if (~index) {
            result.push(splitAddress.splice(index, 1)[0])
        }
    })

    return [...result, ...splitAddress];
}

/**
 * 利用正则表达式解析
 * @param fragment
 * @param hasParseResult
 * @returns {{area: (Array|*|string), province: (Array|*|string), city: (Array|*|string|string), detail: (*|Array)}}
 */
const parseRegionWithRegexp = (fragment, hasParseResult) => {
    let province = hasParseResult.province || [], city = hasParseResult.city || [], area = hasParseResult.area || [],
        detail = []

    let matchStr = ''
    if (province.length === 0) {
        for (let i = 1; i < fragment.length; i++) {
            const str = fragment.substring(0, i + 1)
            const regexProvince = new RegExp(`\{\"code\":\"[0-9]{1,6}\",\"name\":\"${str}[\u4E00-\u9FA5]*?\"}`, 'g')
            const matchProvince = provinceString.match(regexProvince)
            if (matchProvince) {
                const provinceObj = JSON.parse(matchProvince[0])
                if (matchProvince.length === 1) {
                    province = []
                    matchStr = str
                    province.push(provinceObj)
                }
            } else {
                break
            }
        }

        if (province[0]) {
            fragment = fragment.replace(new RegExp(matchStr, 'g'), '')
        }
    }

    if (city.length === 0) {
        if (province[0] && isSpecialAdministrativeRegion(province[0].name)) {
            // 对于特别行政区，使用省级单位作为市级单位
            const cityObj = addressJson.find(p => p.name === province[0].name)?.children[0];
            if (cityObj) {
                city.push({
                    code: cityObj.code,
                    name: province[0].name,
                    provinceCode: province[0].code
                });
            }
        } else {
            for (let i = 1; i < fragment.length; i++) {
                const str = fragment.substring(0, i + 1)
                const regexCity = new RegExp(`\{\"code\":\"[0-9]{1,6}\",\"name\":\"${str}[\u4E00-\u9FA5]*?\",\"provinceCode\":\"${province[0] ? `${province[0].code}` : '[0-9]{1,6}'}\"\}`, 'g')
                const matchCity = cityString.match(regexCity)
                if (matchCity) {
                    const cityObj = JSON.parse(matchCity[0])
                    if (matchCity.length === 1) {
                        city = []
                        matchStr = str
                        city.push(cityObj)
                    }
                } else {
                    break
                }
            }
            if (city[0]) {
                const { provinceCode } = city[0]
                fragment = fragment.replace(new RegExp(matchStr, 'g'), '')
                if (province.length === 0) {
                    const regexProvince = new RegExp(`\{\"code\":\"${provinceCode}\",\"name\":\"[\u4E00-\u9FA5]+?\"}`, 'g')
                    const matchProvince = provinceString.match(regexProvince)
                    province.push(JSON.parse(matchProvince[0]))
                }
            }
        }
    }

    if (area.length === 0) {
        if (province[0] && isSpecialAdministrativeRegion(province[0].name)) {
            // 对于特别行政区，直接从原始数据中查找区域
            const sarAreas = addressJson.find(p => p.name === province[0].name)?.children[0]?.children;
            if (sarAreas) {
                for (let i = 1; i < fragment.length; i++) {
                    const str = fragment.substring(0, i + 1)
                    const matchedArea = sarAreas.find(a => a.name.startsWith(str));
                    if (matchedArea) {
                        if (matchedArea.name === str) {
                            area = []
                            matchStr = str
                            area.push({
                                code: matchedArea.code,
                                name: matchedArea.name,
                                cityCode: city[0].code,
                                provinceCode: province[0].code
                            });
                            break;
                        }
                    } else {
                        break;
                    }
                }
                if (area[0]) {
                    fragment = fragment.replace(matchStr, '')
                }
            }
        } else {
            for (let i = 1; i < fragment.length; i++) {
                const str = fragment.substring(0, i + 1)
                const regexArea = new RegExp(`\{\"code\":\"[0-9]{1,9}\",\"name\":\"${str}[\u4E00-\u9FA5]*?\",\"cityCode\":\"${city[0] ? city[0].code : '[0-9]{1,6}'}\",\"provinceCode\":\"${province[0] ? `${province[0].code}` : '[0-9]{1,6}'}\"\}`, 'g')
                const matchArea = areaString.match(regexArea)
                if (matchArea) {
                    const areaObj = JSON.parse(matchArea[0])
                    if (matchArea.length === 1) {
                        area = []
                        matchStr = str
                        area.push(areaObj)
                    }
                } else {
                    break
                }
            }
            if (area[0]) {
                const { provinceCode, cityCode } = area[0]
                fragment = fragment.replace(matchStr, '')
                if (province.length === 0) {
                    const regexProvince = new RegExp(`\{\"code\":\"${provinceCode}\",\"name\":\"[\u4E00-\u9FA5]+?\"}`, 'g')
                    const matchProvince = provinceString.match(regexProvince)
                    province.push(JSON.parse(matchProvince[0]))
                }
                if (city.length === 0) {
                    const regexCity = new RegExp(`\{\"code\":\"${cityCode}\",\"name\":\"[\u4E00-\u9FA5]+?\",\"provinceCode\":\"${provinceCode}\"\}`, 'g')
                    const matchCity = cityString.match(regexCity)
                    city.push(JSON.parse(matchCity[0]))
                }
            }
        }
    }

    // 解析完省市区如果还存在地址，则默认为详细地址
    if (fragment.length > 0) {
        detail.push(fragment)
    }

    return {
        province,
        city,
        area,
        detail,
    }
}

/**
 * 利用树向下查找解析
 * @param fragment
 * @param hasParseResult
 * @returns {{area: Array, province: Array, city: Array, detail: Array}}
 */
const parseRegion = (fragment, hasParseResult) => {
    let province = [], city = [], area = [], detail = []

    if (hasParseResult.province[0]) {
        province = hasParseResult.province
    } else {
        // 从省开始查找
        for (const tempProvince of provinces) {
            const { name } = tempProvince
            let replaceName = ''
            for (let i = name.length; i > 1; i--) {
                const temp = name.substring(0, i)
                if (fragment.indexOf(temp) === 0) {
                    replaceName = temp
                    break
                }
            }
            if (replaceName) {
                province.push(tempProvince)
                fragment = fragment.replace(new RegExp(replaceName, 'g'), '')
                break
            }
        }
    }
    if (hasParseResult.city[0]) {
        city = hasParseResult.city
    } else {
        // 从市区开始查找
        for (const tempCity of cities) {
            const { name, provinceCode } = tempCity
            const currentProvince = province[0]
            // 有省
            if (currentProvince) {
                if (currentProvince.code === provinceCode) {
                    let replaceName = ''
                    for (let i = name.length; i > 1; i--) {
                        const temp = name.substring(0, i)
                        if (fragment.indexOf(temp) === 0) {
                            replaceName = temp
                            break
                        }
                    }
                    if (replaceName) {
                        city.push(tempCity)
                        fragment = fragment.replace(new RegExp(replaceName, 'g'), '')
                        break
                    }
                }
            } else {
                // 没有省，市不可能重名
                for (let i = name.length; i > 1; i--) {
                    const replaceName = name.substring(0, i)
                    if (fragment.indexOf(replaceName) === 0) {
                        city.push(tempCity)
                        province.push(provinces.find(item => item.code === provinceCode))
                        fragment = fragment.replace(replaceName, '')
                        break
                    }
                }
                if (city.length > 0) {
                    break
                }
            }
        }
    }

    // 从区市县开始查找
    for (const tempArea of areas) {
        const { name, provinceCode, cityCode } = tempArea
        const currentProvince = province[0]
        const currentCity = city[0]

        // 有省或者市
        if (currentProvince || currentCity) {
            if ((currentProvince && currentProvince.code === provinceCode)
                || (currentCity && currentCity.code) === cityCode) {
                let replaceName = ''
                for (let i = name.length; i > 1; i--) {
                    const temp = name.substring(0, i)
                    if (fragment.indexOf(temp) === 0) {
                        replaceName = temp
                        break
                    }
                }
                if (replaceName) {
                    area.push(tempArea)
                    !currentCity && city.push(cities.find(item => item.code === cityCode))
                    !currentProvince && province.push(provinces.find(item => item.code === provinceCode))
                    fragment = fragment.replace(replaceName, '')
                    break
                }
            }
        } else {
            // 没有省市，区县市有可能重名，这里暂时不处理，因为概率极低，可以根据添加市解决
            for (let i = name.length; i > 1; i--) {
                const replaceName = name.substring(0, i)
                if (fragment.indexOf(replaceName) === 0) {
                    area.push(tempArea)
                    city.push(cities.find(item => item.code === cityCode))
                    province.push(provinces.find(item => item.code === provinceCode))
                    fragment = fragment.replace(replaceName, '')
                    break
                }
            }
            if (area.length > 0) {
                break
            }
        }
    }

    // 解析完省市区如果还存在地址，则默认为详细地址
    if (fragment.length > 0) {
        detail.push(fragment)
    }

    return {
        province,
        city,
        area,
        detail,
    }
}

/**
 * 判断是否是名字
 * @param fragment
 * @returns {string}
 */
const judgeFragmentIsName = (fragment, nameMaxLength) => {
    if (!fragment || !/[\u4E00-\u9FA5]/.test(fragment)) {
        return ''
    }

    // 如果包含下列称呼，则认为是名字，可自行添加
    const nameCall = ['先生', '小姐', '同志', '哥哥', '姐姐', '妹妹', '弟弟', '妈妈', '爸爸', '爷爷', '奶奶', '姑姑', '舅舅']
    if (nameCall.find(item => ~fragment.indexOf(item))) {
        return fragment
    }

    const filters = ['街道', '乡镇', '镇', '乡', '公司', '厂']
    if (~filters.findIndex(item => ~fragment.indexOf(item))) {
        return '';
    }

    // 如果百家姓里面能找到这个姓，并且长度在1-5之间
    const nameFirst = fragment.substring(0, 1)
    if (fragment.length <= nameMaxLength && fragment.length > 1 && ~zhCnNames.indexOf(nameFirst)) {
        return fragment
    }

    return ''
}

/**
 * 匹配电话
 * @param address
 * @returns {{address: *, phone: string}}
 */
const filterPhone = (address) => {
    let phone = ''
    // 整理电话格式
    address = address.replace(/(\d{3})-(\d{4})-(\d{4})/g, '$1$2$3')
    address = address.replace(/(\d{3}) (\d{4}) (\d{4})/g, '$1$2$3')
    address = address.replace(/(\d{4}) \d{4} \d{4}/g, '$1$2$3')
    address = address.replace(/(\d{4})/g, '$1')

    const mobileReg = /(0|\+?86-?|17951|)?1[3456789]\d{9}/g
    const mobile = mobileReg.exec(address)
    if (mobile) {
        phone = mobile[0]
        address = address.replace(mobile[0], ' ')
    }
    return { address, phone: phone.replace(/^\+?86-?/g, '') }
}

/**
 * 匹配邮编
 * @param address
 * @returns {{address: *, postalCode: string}}
 */
const filterPostalCode = (address) => {
    let postalCode = ''
    const postalCodeReg = /[1-9]\d{5}(?!\d)/g
    const code = postalCodeReg.exec(address)
    if (code) {
        postalCode = code[0]
        address = address.replace(code[0], ' ')
    }
    return { address, postalCode }
}

/**
 * 清洗地址
 * @param address
 * @returns {*}
 */
const cleanAddress = (address, textFilter = []) => {
    // 去换行等
    address = address
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\t/g, ' ')

    // 自定义去除关键字，可自行添加
    const search = [
        '详细地址',
        '收货地址',
        '收件地址',
        '地址',
        '所在地区',
        '姓名',
        '收货人',
        '收件人',
        '联系人',
        '收',
        '邮编',
        '联系电话',
        '电话',
        '联系人手机号码',
        '手机号码',
        '手机号',
        '自治区直辖县级行政区划',
        '省直辖县级行政区划',
    ].concat(textFilter)
    search.forEach(str => {
        address = address.replace(new RegExp(str, 'g'), ' ')
    })

    // 处理重庆市的特殊情况
    address = address.replace(/重庆市县/g, '重庆市')

    const pattern = /[`~!@#$^&*=|{}':;',\[\]\.<>/?~！@#￥……&*——|{}【】'；：""'。，、？]/g
    // 不要替换括号，因为括号可能是地址的一部分
    address = address.replace(pattern, ' ')

    // 多个空格replace为一个
    address = address.replace(/ {2,}/g, ' ')
    //适配直辖市区
    const municipality = [
        '北京',
        '上海',
        '天津',
        '重庆'
    ]
    municipality.forEach(str => {
        address = address.replace(str + str, str)
    })
    return address
}

export default AddressParse
