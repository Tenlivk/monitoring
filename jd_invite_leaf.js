/*
邀请赢大礼
@Leaf

监控变量：
jd_invite_activity_url -- 监控变量，活动地址
jd_helpPin_invite -- 变量，车头pin，多车头用逗号隔开

NUM_MAX_CONCURRENCY：并发助力数，默认最大并发20，动态计算需要并发的数量(不大于剩余需邀请人数)
mode：0-所有奖品都冲，1-只冲京豆E卡，也可以自定义白名单，2-冲榜首，全部助力第一个车头

account_info: 要跑的pin放进去key里面
account_info.addr: 你的收货地址，对应pin
*/
const $ = new Env("邀请赢大礼");

let envSplitor = ['&','\n']
let httpResult, httpReq, httpResp

let mode = 0 //0-所有奖品都冲，1-只冲京豆E卡，也可以自定义白名单，2-冲榜首，全部助力第一个车头
let prizePattern = ['京豆','E卡']

let printInfo = true
let account_info = {
    'pin': {
        drawBean: true,
        addr: {"countyName":"区","telPhone":"1234567890123","cityName":"市","detailInfo":"地址","userName":"先生","provinceName":"省"},
    },
}

let NUM_MAX_RETRY = 3 //出错重试次数
let NUM_MAX_CONCURRENCY = 20 //最大并发数

let activityUrl =  process.env.jd_invite_activity_url || 'https://pro.m.jd.com/mall/active/dVF7gQUVKyUcuSsVhuya5d2XD4F/index.html?code=d8e966f5199b4450baad1cc532a6af55'

if(!activityUrl.includes('code=')) {
    activityUrl = `https://pro.m.jd.com/mall/active/dVF7gQUVKyUcuSsVhuya5d2XD4F/index.html?code=${activityUrl}`
}
let activityId = activityUrl.match(/mall\/active\/(\w+)/)[1]
let activityCode = activityUrl.match(/code=(\w+)/)[1]

let userCookie = process.env.JD_COOKIE || '';

//额外CK文件，有的话打开，没有的话就别动
//let ck_file = "fugui_ck.txt"
//const fs = require('fs')
//userCookie += '&'+fs.readFileSync(ck_file,"utf8").replace(/\n/g,'&')

let userList = []
let validJdList = []
let inviterList = []
let userIdx = 0
let userCount = 0

let shopId, venderId, shopName
let globalExitFlag = false

let defaultUA = 'Mozilla/5.0 (Linux; Android 9; Note9 Build/PKQ1.181203.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/86.0.4240.99 XWEB/3211 MMWEBSDK/20220303 Mobile Safari/537.36 MMWEBID/8813 MicroMessenger/8.0.21.2120(0x2800153B) Process/appbrand1 WeChat/arm64 Weixin NetType/4G Language/zh_CN ABI/arm64 MiniProgramEnv/android'
let Referer = 'https://prodev.m.jd.com/'
let Origin = 'https://prodev.m.jd.com'

let iosVerList = ["15.1.1", "14.5.1", "14.4", "14.3", "14.2", "14.1", "14.0.1"]
let clientVerList = ["10.3.0", "10.2.7", "10.2.4"]
let iphoneVerList = ["8","9","10","11","12","13"]
///////////////////////////////////////////////////////////////////
class UserInfo {
    constructor(str) {
        this.index = ++userIdx
        this.name = this.index
        this.isJdCK = false
        this.valid = false
        
        try {
            this.cookie = str
            this.pt_key = str.match(/pt_key=([\w\-]+)/)[1]
            this.pt_pin = str.match(/pt_pin=([\w\-\%]+)/)[1]
            this.name = decodeURIComponent(this.pt_pin)
            this.isJdCK = true
            this.uuid = $.randomString(40)
            this.addressid = $.randomString(10,'123456789')
            this.iosVer = $.randomList(iosVerList)
            this.iosVer_ = this.iosVer.replace('.', '_')
            this.iphone = $.randomList(iphoneVerList)
            this.sid = $.randomString(32)
            this.un_area = $.randomString(2,'1234567890') + '-' + $.randomString(4,'1234567890') + '-' + $.randomString(4,'1234567890') + '-' + $.randomString(5,'1234567890')
            this.UA = `jdapp;iPhone;10.1.4;${this.iosVer};${this.uuid};network/wifi;model/iPhone${this.iphone},1;addressid/${this.addressid};appBuild/167707;jdSupportDarkMode/0;Mozilla/5.0 (iPhone; CPU iPhone OS ${this.iosVer_} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/null;supportJDSHWK/1`
            
            this.needInviteNum = 0
            this.successCount = 0
            this.canHelp = true
            this.stageReward = []
        } catch (e) {
            console.log(`账号[${this.index}]CK无效，可能不是京东CK`)
        }
    }
    
    async plogin() {
        try {
            let nowtime = Date.now()
            let url = `https://plogin.m.jd.com/cgi-bin/ml/islogin?time=${nowtime}&callback=__jsonp${nowtime-2}&_=${nowtime+2}`
            let body = ''
            let urlObject = populateUrlObject(url,this.cookie,this.UA,body)
            await httpRequest('get',urlObject)
            let result = httpResult;
            if(!result) return Promise.resolve(0);
            //console.log(result)
            if(result.indexOf('"islogin":"1"') > -1) {
                console.log(`账号${this.index}[${this.name}]登录成功`)
            } else {
                console.log(`账号${this.index}[${this.name}]登录失败`)
            }
        } catch(e) {
            console.log(e)
        } finally {
            return Promise.resolve(1);
        }
    }
    
    async getActivityPage(helpee,isMain=false) {
        try {
            let nowtime = Date.now()
            let url = `https://jdjoy.jd.com/member/bring/getActivityPage?code=${activityCode}&invitePin=${helpee.pt_pin}&_t=${nowtime}`
            let body = ''
            let urlObject = populateUrlObject(url,this.cookie,this.UA,body)
            await httpRequest('get',urlObject)
            let result = httpResult;
            if(!result) return Promise.resolve(0);
            //console.log(JSON.stringify(result))
            if(result.success == true) {
                if(isMain) {
                    shopId = result.data.shopId.toString()
                    venderId = result.data.venderId.toString()
                    shopName = result.data.shopName
                    nowtime = Date.now()
                    this.successCount = result.data.successCount
                    if(printInfo) {
                        $.logAndNotify(`------------------------------------------`)
                        $.logAndNotify(`活动：${result.data.inviteFloor}`)
                        $.logAndNotify(`开始时间：${$.time('yyyy-MM-dd hh:mm:ss',result.data.beginTime)}`)
                        $.logAndNotify(`结束时间：${$.time('yyyy-MM-dd hh:mm:ss',result.data.endTime)}`)
                        $.logAndNotify(`店铺：${shopName}`)
                        $.logAndNotify(`shopId：${shopId}`)
                        $.logAndNotify(`venderId：${venderId}`)
                        if(result.data.rankFloor && result.data?.rankInfo?.rewardList && result.data.rankInfo.rewardList.length > 0) {
                            $.logAndNotify(`${result.data.rankFloor}：`)
                            for(let item of result.data.rankInfo.rewardList) {
                                $.logAndNotify(`-- ${item.introduction}`)
                            }
                        }
                        $.logAndNotify(`------------------------------------------`)
                        printInfo = false
                    }
                    $.logAndNotify(`账号${this.index}[${this.name}]奖品：`)
                    let remainCount = 0;
                    for(let item of result.data.rewards) {
                        this.stageReward.push({
                            stage: item.stage,
                            inviteNum: item.inviteNum, 
                            rewardName: item.rewardName,
                            rewardStock: item.rewardStock,
                            rewardStatus: item.rewardStatus,
                        })
                        if(item.rewardType == 1 || item.rewardType == 3) {
                            if(item.rewardStock > 0) {
                                remainCount = $.getMax(remainCount,item.rewardStock)
                            }
                        }
                        if(item.rewardStock > 0 && item.rewardStatus <= 1) {
                            switch(item.rewardType) {
                                case 1: //京豆
                                    if(!account_info[this.pt_pin].drawBean) {
                                        console.log(`账号${this.index}[${this.name}]设置为不拿京豆`)
                                        break;
                                    }
                                case 3: //实物
                                    this.needHelp = true
                                    if(mode == 0) {
                                        this.needInviteNum = $.getMax(item.inviteNum,this.needInviteNum)
                                    } else if(mode == 1) {
                                        for(let pattern of prizePattern) {
                                            if(item.rewardName.indexOf(pattern) > -1) {
                                                this.needInviteNum = $.getMax(item.inviteNum,this.needInviteNum)
                                                break;
                                            }
                                        }
                                    }
                                    break;
                                case 2: //优惠券
                                default:
                                    break;
                            }
                        }
                        if(mode == 2) {
                            this.needHelp = true
                            this.needInviteNum = 99999999
                        }
                        let rstr = '未达标'
                        if(item.rewardStatus == 1) {
                            rstr = '未达标'
                        } else if(item.rewardStatus == 2) {
                            rstr = '待领取'
                        } else if(item.rewardStatus == 3) {
                            rstr = '已领取'
                        } else if(item.rewardStatus == 4) {
                            rstr = '已发完'
                        }
                        $.logAndNotify(`-- [${item.stage}] ${item.inviteNum}人：${item.rewardName}，剩余${item.rewardStock}份，${rstr}`)
                    }
                    if(remainCount == 0) {
                        $.logAndNotify(`所有京豆和实物奖品已发完，退出`)
                        await $.showmsg();
                        process.exit(0);
                    }
                    $.logAndNotify(`已邀请：${this.successCount}人`)
                    if(this.needHelp) {
                        console.log(`账号${this.index}[${this.name}]需要邀请${this.needInviteNum}人`)
                    } else {
                        console.log(`账号${this.index}[${this.name}]不需要邀请`)
                    }
                    if(nowtime < result.data.beginTime) {
                        $.logAndNotify('活动未开始，退出')
                        globalExitFlag = true
                    }
                    if(nowtime > result.data.endTime) {
                        $.logAndNotify('活动已过期，退出')
                        globalExitFlag = true
                    }
                }
            } else {
                console.log(`账号${this.index}[${this.name}]进入活动页面失败：${result.errorMessage}`)
                this.canHelp = false
            }
        } catch(e) {
            console.log(e)
            console.log(result)
            console.log('----------------')
        } finally {
            return Promise.resolve(1);
        }
    }
    
    async firstInvite(retry=false) {
        try {
            let url = `https://jdjoy.jd.com/member/bring/firstInvite?code=${activityCode}`
            let body = ''
            let urlObject = populateUrlObject(url,this.cookie,this.UA,body)
            await httpRequest('get',urlObject)
            let result = httpResult;
            if(!result) return Promise.resolve(0);
            //console.log(JSON.stringify(result))
            if(result.success == true) {
                console.log(`账号${this.index}[${this.name}]开启邀请成功`)
            } else {
                console.log(`账号${this.index}[${this.name}]开启邀请失败：${result.errorMessage}`)
                if(result?.errorMessage?.includes('没有访问权限') && !retry) {
                    await this.joinMember()
                    await $.wait(3000)
                    await this.firstInvite(true)
                } else {
                    this.isBlack = true
                }
            }
        } catch(e) {
            console.log(e)
        } finally {
            return Promise.resolve(1);
        }
    }
    
    async getInviteReward(rewards,retry=0) {
        try {
            let url = `https://jdjoy.jd.com/member/bring/getInviteReward?code=${activityCode}&stage=${rewards.stage}`
            let body = ''
            let urlObject = populateUrlObject(url,this.cookie,this.UA,body)
            await httpRequest('get',urlObject)
            let result = httpResult;
            if(!result) return Promise.resolve(0);
            //console.log(JSON.stringify(result))
            if(result.success == true) {
                rewards.rewardStatus = 3
                $.logAndNotify(`账号${this.index}[${this.name}]领取阶段[${rewards.stage}]奖励[${rewards.rewardName}]成功`)
            } else {
                if(result.errorMessage.indexOf('交易失败') > -1) {
                    $.logAndNotify(`账号${this.index}[${this.name}]领取阶段[${rewards.stage}]奖励[${rewards.rewardName}]失败`)
                    if(account_info[this.pt_pin] && retry == 0) {
                        await this.saveAddress(account_info[this.pt_pin].addr,rewards)
                    } else {
                        rewards.rewardStatus = 3
                    }
                } else {
                    $.logAndNotify(`账号${this.index}[${this.name}]领取阶段[${rewards.stage}]奖励[${rewards.rewardName}]失败：${result.errorMessage}`)
                    if(result.errorMessage && result.errorMessage.includes('参加过')) {
                        rewards.rewardStatus = 3
                    }
                }
            }
        } catch(e) {
            console.log(e)
        } finally {
            return Promise.resolve(1);
        }
    }
    
    async saveAddress(addr,rewards) {
        try {
            let url = `https://jdjoy.jd.com/member/bring/saveAddress?code=${activityCode}`
            let urlObject = populateUrlObject(url,this.cookie,this.UA,JSON.stringify(addr))
            await httpRequest('post',urlObject)
            let result = httpResult;
            if(!result) return Promise.resolve(0);
            //console.log(JSON.stringify(result))
            if(result.success == true) {
                $.logAndNotify(`账号${this.index}[${this.name}]保存地址成功:`)
                $.logAndNotify(JSON.stringify(addr))
                await $.wait(5000)
                await this.getInviteReward(rewards,1)
            } else {
                $.logAndNotify(`账号${this.index}[${this.name}]保存地址失败：${result.errorMessage}`)
            }
        } catch(e) {
            console.log(e)
        } finally {
            return Promise.resolve(1);
        }
    }
    
    async getShopOpenCardInfo(retry=0) {
        try {
            let bodyParam = {"venderId":venderId, "channel":"401"}
            let url = `https://api.m.jd.com/client.action?appid=jd_shop_member&functionId=getShopOpenCardInfo&body=${encodeURIComponent(JSON.stringify(bodyParam))}&client=H5&clientVersion=9.2.0&uuid=88888`
            let body = ''
            let urlObject = populateUrlObject(url,this.cookie,this.UA,body)
            delete urlObject.headers.Origin
            this.referUrl = `https://prodev.m.jd.com/mall/active/${activityId}/index.html?code=${activityCode}`
            urlObject.headers.Referer = `https://shopmember.m.jd.com/shopcard/?venderId=${venderId}&channel=801&returnUrl=${encodeURIComponent(this.referUrl)}`
            await httpRequest('get',urlObject)
            let result = httpResult;
            if(!result) return Promise.resolve(0);
            //console.log(JSON.stringify(result))
            if(result.success == true) {
                if(result.result.userInfo.openCardStatus==0) {
                    this.canHelp = true
                    console.log(`账号${this.index}[${this.name}]未入会，可以助力`)
                } else {
                    this.canHelp = false
                    console.log(`账号${this.index}[${this.name}]已入会`)
                }
            } else {
                if(result.message.indexOf('火爆') > -1) {
                    this.canHelp = false
                    console.log(`账号${this.index}[${this.name}]获取入会状态火爆，黑号`)
                } else if(retry < NUM_MAX_RETRY) {
                    console.log(`账号${this.index}[${this.name}]获取入会状态失败[${result.busiCode}]，重试第${++retry}次：${result.message}`)
                    await $.wait(200)
                    await this.getShopOpenCardInfo(retry)
                } else {
                    this.canHelp = false
                    console.log(`账号${this.index}[${this.name}]获取入会状态失败[${result.busiCode}]：${result.message}`)
                }
            }
        } catch(e) {
            console.log(e)
        } finally {
            return Promise.resolve(1);
        }
    }
    
    async joinMember(helpee,retry=0) {
        try {
            let url = `https://jdjoy.jd.com/member/bring/joinMember?code=${activityCode}&invitePin=${helpee?.pt_pin||''}`
            let body = ''
            let urlObject = populateUrlObject(url,this.cookie,this.UA,body)
            urlObject.headers.Referer = this.referUrl
            await httpRequest('get',urlObject)
            let result = httpResult;
            if(!result) return Promise.resolve(0);
            //console.log(JSON.stringify(result))
            if(result.success == true) {
                this.canHelp = false
                if(helpee) {
                    if(helpee.pt_pin != this.pt_pin) helpee.successCount += 1
                    console.log(`账号${this.index}[${this.name}]入会成功，已助力[${helpee.name}]`)
                } else {
                    console.log(`账号${this.index}[${this.name}]入会成功`)
                }
            } else {
                if(result.errorMessage.indexOf('交易失败') > -1) {
                    if(helpee.pt_pin != this.pt_pin) helpee.successCount += 1
                    this.canHelp = false
                    console.log(`账号${this.index}[${this.name}]入会成功，已助力[${helpee.name}]`)
                } else if(result.errorMessage.indexOf('data already exist') > -1) {
                    console.log(`账号${this.index}[${this.name}]已入过会`)
                    this.canHelp = false
                } else if(result.errorMessage.indexOf('火爆') > -1) {
                    console.log(`账号${this.index}[${this.name}]入会火爆`)
                    this.canHelp = false
                } else if(retry < NUM_MAX_RETRY) {
                    console.log(`账号${this.index}[${this.name}]入会失败，重试第${++retry}次：${result.errorMessage}`)
                    await $.wait(200)
                    await this.joinMember(helpee,retry)
                } else {
                    this.canHelp = false
                    console.log(`账号${this.index}[${this.name}]入会失败：${result.errorMessage}`)
                }
            }
        } catch(e) {
            console.log(e)
        } finally {
            return Promise.resolve(1);
        }
    }
    
    async userHelpTask(helpee) {
        try {
            await this.getShopOpenCardInfo();
            if(!this.canHelp) return Promise.resolve(1);
            await this.getActivityPage(helpee);
            await this.joinMember(helpee)
        } catch(e) {
            console.log(e)
        } finally {
            return Promise.resolve(1);
        }
    }
    
    async userInviteTask() {
        try {
            console.log(`\n----- 账号${this.index}[${this.name}]开始邀请 -----`)
            let helpee = this
            let needHelpList = inviterList.filter(x => x.index != this.index && x.successCount < x.needInviteNum)
            if(needHelpList.length > 0) helpee = needHelpList[0]
            await this.getActivityPage(helpee,true);
            for(let rewards of this.stageReward) {
                if(rewards.rewardStatus <= 2 && this.successCount >= rewards.inviteNum && rewards.rewardStock > 0) {
                    await $.wait(5000)
                    await this.getInviteReward(rewards)
                }
            }
            if(!this.needHelp) return;
            if(globalExitFlag) return;
            if(this.canHelp) await this.joinMember(helpee);
            await this.firstInvite();
            if(this.isBlack) return;
            
            if(this.needHelp) {
                if(this.successCount < this.needInviteNum) {
                    let canHelpList = validJdList.filter(x => x.index != this.index && x.canHelp)
                    let concurrency = $.getMin(this.needInviteNum-this.successCount,NUM_MAX_CONCURRENCY)
                    let taskall = []
                    for(let helper of canHelpList) {
                        taskall.push(helper.userHelpTask(this));
                        if(taskall.length >= concurrency) {
                            await Promise.all(taskall)
                            taskall = []
                            concurrency = $.getMin(this.needInviteNum-this.successCount,NUM_MAX_CONCURRENCY)
                            let exitFlag = true
                            for(let rewards of this.stageReward) {
                                if(rewards.rewardStatus <= 2 && this.successCount >= rewards.inviteNum && rewards.rewardStock > 0) {
                                    await $.wait(5000)
                                    await this.getInviteReward(rewards)
                                }
                                if(rewards.rewardStock > 0 && rewards.rewardStatus <= 1) {
                                    exitFlag = false
                                }
                            }
                            if(mode == 2) {
                                exitFlag = false
                            }
                            if(this.successCount >= this.needInviteNum) {
                                exitFlag = true
                            }
                            if(exitFlag) break;
                        }
                    }
                    await Promise.all(taskall)
                }
            }
        } catch(e) {
            console.log(e)
        } finally {
            return Promise.resolve(1);
        }
    }
}

!(async () => {
    if (typeof $request !== "undefined") {
        await GetRewrite()
    }else {
        
        if(!(await checkEnv())) return;
        
        validJdList = userList.filter(x => x.isJdCK)
        if(validJdList.length == 0) {
            console.log('未找到有效的京东CK')
            return;
        }
        
        $.logAndNotify(`\n活动链接: ${activityUrl}\n`);
        
        let inviterList = validJdList.filter(x => Object.keys(account_info).includes(x.pt_pin))
        console.log(`共找到${inviterList.length}个车头pin`)
        if(inviterList.length == 0) return;
        
        for(let user of inviterList) {
            await user.userInviteTask();
            if(globalExitFlag) return;
        }
        
        await $.showmsg();
    }
})()
.catch((e) => console.log(e))
.finally(() => $.done())

///////////////////////////////////////////////////////////////////
async function checkEnv() {
    if(userCookie) {
        let splitor = envSplitor[0];
        for(let sp of envSplitor) {
            if(userCookie.indexOf(sp) > -1) {
                splitor = sp;
                break;
            }
        }
        for(let userCookies of userCookie.split(splitor)) {
            if(userCookies) userList.push(new UserInfo(userCookies))
        }
        userCount = userList.length
    } else {
        console.log('未找到CK')
        return;
    }
    
    console.log(`共找到${userCount}个账号`)
    return true
}

////////////////////////////////////////////////////////////////////
function populateUrlObject(url,cookie,UA,body){
    let host = url.replace('//','/').split('/')[1]
    let urlObject = {
        url: url,
        headers: {
            'Host': host,
            'Cookie': cookie,
            'User-Agent': UA,
            'Connection': 'keep-alive',
            'Cookie': cookie,
            'Referer': Referer,
            'Origin': Origin,
            'request-from': 'native',
        },
        timeout: 5000,
    }
    if(body) {
        urlObject.body = body
        urlObject.headers['Content-Type'] =  'application/json'
        //urlObject.headers['Content-Length'] = urlObject.body ? urlObject.body.length : 0
    }
    return urlObject;
}

async function httpRequest(method,url) {
    httpResult = null, httpReq = null, httpResp = null;
    return new Promise((resolve) => {
        $.send(method, url, async (err, req, resp) => {
            try {
                httpReq = req;
                httpResp = resp;
                if (err) {
                    console.log(err)
                    //console.log(req)
                    //console.log(resp)
                } else {
                    if(resp.body) {
                        if(typeof resp.body == "object") {
                            httpResult = resp.body;
                        } else {
                            try {
                                httpResult = JSON.parse(resp.body);
                            } catch (e) {
                                httpResult = resp.body;
                            }
                        }
                    }
                }
            } catch (e) {
                //console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

////////////////////////////////////////////////////////////////////
//AES/DES加解密，CryptoJS
function EncryptCrypto(method,mode,padding,message,key,iv) {
    return CryptoJS[method].encrypt(
        CryptoJS.enc.Utf8.parse(message), 
        CryptoJS.enc.Utf8.parse(key), 
        {mode:CryptoJS.mode[mode], padding:CryptoJS.pad[padding], iv:CryptoJS.enc.Utf8.parse(iv)}
    ).ciphertext.toString(CryptoJS.enc.Base64);
}
function DecryptCrypto(method,mode,padding,message,key,iv) {
    return CryptoJS[method].decrypt(
        {ciphertext: CryptoJS.enc.Base64.parse(message)}, 
        CryptoJS.enc.Utf8.parse(key), 
        {mode:CryptoJS.mode[mode], padding:CryptoJS.pad[padding], iv:CryptoJS.enc.Utf8.parse(iv)}
    ).toString(CryptoJS.enc.Utf8);
}
//Base64加解密
var Base64={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9+/=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/rn/g,"n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}}
//MD5
function MD5Encrypt(a){function b(a,b){return a<<b|a>>>32-b}function c(a,b){var c,d,e,f,g;return e=2147483648&a,f=2147483648&b,c=1073741824&a,d=1073741824&b,g=(1073741823&a)+(1073741823&b),c&d?2147483648^g^e^f:c|d?1073741824&g?3221225472^g^e^f:1073741824^g^e^f:g^e^f}function d(a,b,c){return a&b|~a&c}function e(a,b,c){return a&c|b&~c}function f(a,b,c){return a^b^c}function g(a,b,c){return b^(a|~c)}function h(a,e,f,g,h,i,j){return a=c(a,c(c(d(e,f,g),h),j)),c(b(a,i),e)}function i(a,d,f,g,h,i,j){return a=c(a,c(c(e(d,f,g),h),j)),c(b(a,i),d)}function j(a,d,e,g,h,i,j){return a=c(a,c(c(f(d,e,g),h),j)),c(b(a,i),d)}function k(a,d,e,f,h,i,j){return a=c(a,c(c(g(d,e,f),h),j)),c(b(a,i),d)}function l(a){for(var b,c=a.length,d=c+8,e=(d-d%64)/64,f=16*(e+1),g=new Array(f-1),h=0,i=0;c>i;)b=(i-i%4)/4,h=i%4*8,g[b]=g[b]|a.charCodeAt(i)<<h,i++;return b=(i-i%4)/4,h=i%4*8,g[b]=g[b]|128<<h,g[f-2]=c<<3,g[f-1]=c>>>29,g}function m(a){var b,c,d="",e="";for(c=0;3>=c;c++)b=a>>>8*c&255,e="0"+b.toString(16),d+=e.substr(e.length-2,2);return d}function n(a){a=a.replace(/\r\n/g,"\n");for(var b="",c=0;c<a.length;c++){var d=a.charCodeAt(c);128>d?b+=String.fromCharCode(d):d>127&&2048>d?(b+=String.fromCharCode(d>>6|192),b+=String.fromCharCode(63&d|128)):(b+=String.fromCharCode(d>>12|224),b+=String.fromCharCode(d>>6&63|128),b+=String.fromCharCode(63&d|128))}return b}var o,p,q,r,s,t,u,v,w,x=[],y=7,z=12,A=17,B=22,C=5,D=9,E=14,F=20,G=4,H=11,I=16,J=23,K=6,L=10,M=15,N=21;for(a=n(a),x=l(a),t=1732584193,u=4023233417,v=2562383102,w=271733878,o=0;o<x.length;o+=16)p=t,q=u,r=v,s=w,t=h(t,u,v,w,x[o+0],y,3614090360),w=h(w,t,u,v,x[o+1],z,3905402710),v=h(v,w,t,u,x[o+2],A,606105819),u=h(u,v,w,t,x[o+3],B,3250441966),t=h(t,u,v,w,x[o+4],y,4118548399),w=h(w,t,u,v,x[o+5],z,1200080426),v=h(v,w,t,u,x[o+6],A,2821735955),u=h(u,v,w,t,x[o+7],B,4249261313),t=h(t,u,v,w,x[o+8],y,1770035416),w=h(w,t,u,v,x[o+9],z,2336552879),v=h(v,w,t,u,x[o+10],A,4294925233),u=h(u,v,w,t,x[o+11],B,2304563134),t=h(t,u,v,w,x[o+12],y,1804603682),w=h(w,t,u,v,x[o+13],z,4254626195),v=h(v,w,t,u,x[o+14],A,2792965006),u=h(u,v,w,t,x[o+15],B,1236535329),t=i(t,u,v,w,x[o+1],C,4129170786),w=i(w,t,u,v,x[o+6],D,3225465664),v=i(v,w,t,u,x[o+11],E,643717713),u=i(u,v,w,t,x[o+0],F,3921069994),t=i(t,u,v,w,x[o+5],C,3593408605),w=i(w,t,u,v,x[o+10],D,38016083),v=i(v,w,t,u,x[o+15],E,3634488961),u=i(u,v,w,t,x[o+4],F,3889429448),t=i(t,u,v,w,x[o+9],C,568446438),w=i(w,t,u,v,x[o+14],D,3275163606),v=i(v,w,t,u,x[o+3],E,4107603335),u=i(u,v,w,t,x[o+8],F,1163531501),t=i(t,u,v,w,x[o+13],C,2850285829),w=i(w,t,u,v,x[o+2],D,4243563512),v=i(v,w,t,u,x[o+7],E,1735328473),u=i(u,v,w,t,x[o+12],F,2368359562),t=j(t,u,v,w,x[o+5],G,4294588738),w=j(w,t,u,v,x[o+8],H,2272392833),v=j(v,w,t,u,x[o+11],I,1839030562),u=j(u,v,w,t,x[o+14],J,4259657740),t=j(t,u,v,w,x[o+1],G,2763975236),w=j(w,t,u,v,x[o+4],H,1272893353),v=j(v,w,t,u,x[o+7],I,4139469664),u=j(u,v,w,t,x[o+10],J,3200236656),t=j(t,u,v,w,x[o+13],G,681279174),w=j(w,t,u,v,x[o+0],H,3936430074),v=j(v,w,t,u,x[o+3],I,3572445317),u=j(u,v,w,t,x[o+6],J,76029189),t=j(t,u,v,w,x[o+9],G,3654602809),w=j(w,t,u,v,x[o+12],H,3873151461),v=j(v,w,t,u,x[o+15],I,530742520),u=j(u,v,w,t,x[o+2],J,3299628645),t=k(t,u,v,w,x[o+0],K,4096336452),w=k(w,t,u,v,x[o+7],L,1126891415),v=k(v,w,t,u,x[o+14],M,2878612391),u=k(u,v,w,t,x[o+5],N,4237533241),t=k(t,u,v,w,x[o+12],K,1700485571),w=k(w,t,u,v,x[o+3],L,2399980690),v=k(v,w,t,u,x[o+10],M,4293915773),u=k(u,v,w,t,x[o+1],N,2240044497),t=k(t,u,v,w,x[o+8],K,1873313359),w=k(w,t,u,v,x[o+15],L,4264355552),v=k(v,w,t,u,x[o+6],M,2734768916),u=k(u,v,w,t,x[o+13],N,1309151649),t=k(t,u,v,w,x[o+4],K,4149444226),w=k(w,t,u,v,x[o+11],L,3174756917),v=k(v,w,t,u,x[o+2],M,718787259),u=k(u,v,w,t,x[o+9],N,3951481745),t=c(t,p),u=c(u,q),v=c(v,r),w=c(w,s);var O=m(t)+m(u)+m(v)+m(w);return O.toLowerCase()}
//SHA1
function SHA1Encrypt(msg){function add(x,y){return((x&0x7FFFFFFF)+(y&0x7FFFFFFF))^(x&0x80000000)^(y&0x80000000);}function SHA1hex(num){var sHEXChars="0123456789abcdef";var str="";for(var j=7;j>=0;j--)str+=sHEXChars.charAt((num>>(j*4))&0x0F);return str;}function AlignSHA1(sIn){var nblk=((sIn.length+8)>>6)+1,blks=new Array(nblk*16);for(var i=0;i<nblk*16;i++)blks[i]=0;for(i=0;i<sIn.length;i++)blks[i>>2]|=sIn.charCodeAt(i)<<(24-(i&3)*8);blks[i>>2]|=0x80<<(24-(i&3)*8);blks[nblk*16-1]=sIn.length*8;return blks;}function rol(num,cnt){return(num<<cnt)|(num>>>(32-cnt));}function ft(t,b,c,d){if(t<20)return(b&c)|((~b)&d);if(t<40)return b^c^d;if(t<60)return(b&c)|(b&d)|(c&d);return b^c^d;}function kt(t){return(t<20)?1518500249:(t<40)?1859775393:(t<60)?-1894007588:-899497514;}var x=AlignSHA1(msg);var w=new Array(80);var a=1732584193;var b=-271733879;var c=-1732584194;var d=271733878;var e=-1009589776;for(var i=0;i<x.length;i+=16){var olda=a;var oldb=b;var oldc=c;var oldd=d;var olde=e;for(var j=0;j<80;j++){if(j<16)w[j]=x[i+j];else w[j]=rol(w[j-3]^w[j-8]^w[j-14]^w[j-16],1);t=add(add(rol(a,5),ft(j,b,c,d)),add(add(e,w[j]),kt(j)));e=d;d=c;c=rol(b,30);b=a;a=t;}a=add(a,olda);b=add(b,oldb);c=add(c,oldc);d=add(d,oldd);e=add(e,olde);}SHA1Value=SHA1hex(a)+SHA1hex(b)+SHA1hex(c)+SHA1hex(d)+SHA1hex(e);return SHA1Value;}
////////////////////////////////////////////////////////////////////
function Env(name,env) {
    "undefined" != typeof process && JSON.stringify(process.env).indexOf("GITHUB") > -1 && process.exit(0);
    return new class {
        constructor(name,env) {
            this.name = name
            this.notifyStr = ''
            this.startTime = (new Date).getTime()
            Object.assign(this,env)
            console.log(`${this.name} 开始运行：\n`)
        }
        isNode() {
            return "undefined" != typeof module && !!module.exports
        }
        isQuanX() {
            return "undefined" != typeof $task
        }
        isSurge() {
            return "undefined" != typeof $httpClient && "undefined" == typeof $loon
        }
        isLoon() {
            return "undefined" != typeof $loon
        }
        getdata(t) {
            let e = this.getval(t);
            if (/^@/.test(t)) {
                const[, s, i] = /^@(.*?)\.(.*?)$/.exec(t),
                r = s ? this.getval(s) : "";
                if (r)
                    try {
                        const t = JSON.parse(r);
                        e = t ? this.lodash_get(t, i, "") : e
                    } catch (t) {
                        e = ""
                    }
            }
            return e
        }
        setdata(t, e) {
            let s = !1;
            if (/^@/.test(e)) {
                const[, i, r] = /^@(.*?)\.(.*?)$/.exec(e),
                o = this.getval(i),
                h = i ? "null" === o ? null : o || "{}" : "{}";
                try {
                    const e = JSON.parse(h);
                    this.lodash_set(e, r, t),
                    s = this.setval(JSON.stringify(e), i)
                } catch (e) {
                    const o = {};
                    this.lodash_set(o, r, t),
                    s = this.setval(JSON.stringify(o), i)
                }
            }
            else
                s = this.setval(t, e);
            return s
        }
        getval(t) {
            return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null
        }
        setval(t, e) {
            return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null
        }
        send(m, t, e = (() => {})) {
            if(m != 'get' && m != 'post' && m != 'put' && m != 'delete') {
                console.log(`无效的http方法：${m}`);
                return;
            }
            if(m == 'get' && t.headers) {
                delete t.headers["Content-Type"];
                delete t.headers["Content-Length"];
            } else if(t.body && t.headers) {
                if(!t.headers["Content-Type"]) t.headers["Content-Type"] = "application/x-www-form-urlencoded";
            }
            if(this.isSurge() || this.isLoon()) {
                if(this.isSurge() && this.isNeedRewrite) {
                    t.headers = t.headers || {};
                    Object.assign(t.headers, {"X-Surge-Skip-Scripting": !1});
                }
                let conf = {
                    method: m,
                    url: t.url,
                    headers: t.headers,
                    timeout: t.timeout,
                    data: t.body
                };
                if(m == 'get') delete conf.data
                $axios(conf).then(t => {
                    const {
                        status: i,
                        request: q,
                        headers: r,
                        data: o
                    } = t;
                    e(null, q, {
                        statusCode: i,
                        headers: r,
                        body: o
                    });
                }).catch(err => console.log(err))
            } else if (this.isQuanX()) {
                t.method = m.toUpperCase(), this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
                        hints: !1
                    })),
                $task.fetch(t).then(t => {
                    const {
                        statusCode: i,
                        request: q,
                        headers: r,
                        body: o
                    } = t;
                    e(null, q, {
                        statusCode: i,
                        headers: r,
                        body: o
                    })
                }, t => e(t))
            } else if (this.isNode()) {
                this.got = this.got ? this.got : require("got");
                const {
                    url: s,
                    ...i
                } = t;
                this.instance = this.got.extend({
                    followRedirect: false
                });
                this.instance[m](s, i).then(t => {
                    const {
                        statusCode: i,
                        request: q,
                        headers: r,
                        body: o
                    } = t;
                    e(null, q, {
                        statusCode: i,
                        headers: r,
                        body: o
                    })
                }, t => {
                    const {
                        message: s,
                        response: i
                    } = t;
                    e(s, i, i && i.body)
                })
            }
        }
        time(t,x=null) {
            let xt = x ? new Date(x) : new Date
            let e = {
                "M+": xt.getMonth() + 1,
                "d+": xt.getDate(),
                "h+": xt.getHours(),
                "m+": xt.getMinutes(),
                "s+": xt.getSeconds(),
                "q+": Math.floor((xt.getMonth() + 3) / 3),
                S: xt.getMilliseconds()
            };
            /(y+)/.test(t) && (t = t.replace(RegExp.$1, (xt.getFullYear() + "").substr(4 - RegExp.$1.length)));
            for (let s in e)
                new RegExp("(" + s + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? e[s] : ("00" + e[s]).substr(("" + e[s]).length)));
            return t
        }
        async showmsg() {
            if(!this.notifyStr) return;
            let notifyBody = this.name + " 运行通知\n\n" + this.notifyStr
            if($.isNode()){
                var notify = require('./sendNotify');
                console.log('\n============== 推送 ==============')
                await notify.sendNotify(this.name, notifyBody);
            } else {
                this.msg(notifyBody);
            }
        }
        logAndNotify(str) {
            console.log(str)
            this.notifyStr += str
            this.notifyStr += '\n'
        }
        msg(e = t, s = "", i = "", r) {
            const o = t => {
                if (!t)
                    return t;
                if ("string" == typeof t)
                    return this.isLoon() ? t : this.isQuanX() ? {
                        "open-url": t
                    }
                 : this.isSurge() ? {
                    url: t
                }
                 : void 0;
                if ("object" == typeof t) {
                    if (this.isLoon()) {
                        let e = t.openUrl || t.url || t["open-url"],
                        s = t.mediaUrl || t["media-url"];
                        return {
                            openUrl: e,
                            mediaUrl: s
                        }
                    }
                    if (this.isQuanX()) {
                        let e = t["open-url"] || t.url || t.openUrl,
                        s = t["media-url"] || t.mediaUrl;
                        return {
                            "open-url": e,
                            "media-url": s
                        }
                    }
                    if (this.isSurge()) {
                        let e = t.url || t.openUrl || t["open-url"];
                        return {
                            url: e
                        }
                    }
                }
            };
            this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r)));
            let h = ["", "============== 系统通知 =============="];
            h.push(e),
            s && h.push(s),
            i && h.push(i),
            console.log(h.join("\n"))
        }
        getMin(a,b){
            return ((a<b) ? a : b)
        }
        getMax(a,b){
            return ((a<b) ? b : a)
        }
        padStr(num,length,padding='0') {
            let numStr = String(num)
            let numPad = (length>numStr.length) ? (length-numStr.length) : 0
            let retStr = ''
            for(let i=0; i<numPad; i++) {
                retStr += padding
            }
            retStr += numStr
            return retStr;
        }
        json2str(obj,c,encodeUrl=false) {
            let ret = []
            for(let keys of Object.keys(obj).sort()) {
                let v = obj[keys]
                if(v && encodeUrl) v = encodeURIComponent(v)
                ret.push(keys+'='+v)
            }
            return ret.join(c);
        }
        str2json(str,decodeUrl=false) {
            let ret = {}
            for(let item of str.split('&')) {
                if(!item) continue;
                let idx = item.indexOf('=')
                if(idx == -1) continue;
                let k = item.substr(0,idx)
                let v = item.substr(idx+1)
                if(decodeUrl) v = decodeURIComponent(v)
                ret[k] = v
            }
            return ret;
        }
        randomString(len,charset='abcdef0123456789') {
            let str = '';
            for (let i = 0; i < len; i++) {
                str += charset.charAt(Math.floor(Math.random()*charset.length));
            }
            return str;
        }
        randomList(a) {
            let idx = Math.floor(Math.random()*a.length)
            return a[idx]
        }
        wait(t) {
            return new Promise(e => setTimeout(e, t))
        }
        done(t = {}) {
            const e = (new Date).getTime(),
            s = (e - this.startTime) / 1e3;
            console.log(`\n${this.name} 运行结束，共运行了 ${s} 秒！`)
            if(this.isSurge() || this.isQuanX() || this.isLoon()) $done(t)
        }
    }(name,env)
}
