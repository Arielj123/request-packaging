import Request from "luch-request"; // npm install luch-request 也可以使用其他插件，比如axios
const baseConfig = {
    dev: {
        apiUrl: "http://192.168.0.1/mqshchannel/" // 开发环境接口api
    },
    pro: {
        apiUrl: "https://192.168.0.1/mqshchannel/", // 生产环境接口api
    },
    header: {
        appId: "1111",
        channelCode: "",
        os: wx.getSystemInfoSync().system.indexOf('iOS') != -1 ? 'ios' : 'android',
        version: wx.getAccountInfoSync().miniProgram.version || '1.0.0'
    }
}

let env = 'production'; // production线上
// let env = 'development' // development开发

const getTokenStorage = () => {
    let token = "";
    try {
        token = uni.getStorageSync("token");
    } catch (e) {}
    return token;
};

const http = new Request();
http.setConfig((config) => {
    /* 设置全局配置 */
    config.baseURL = `${
    env == "development"
      ? baseConfig.dev.apiUrl
      : baseConfig.pro.apiUrl
  }`;
    config.header = {
        ...config.header,
        ...baseConfig.header
    };
    return config;
});

let login = (config) => {
    return new Promise((resolve, reject) => {
        wx.login({
            success: (res) => {
                if (res.code) {
                    wx.request({
                        url: `${config.baseURL}login`, //仅为示例，并非真实的接口地址
                        data: {
                            code: res.code,
                        },
                        method: "POST",
                        header: config.header,
                        success(loginres) {
                            uni.setStorageSync("token", loginres.data.data.accessToken);
                            config.header = {
                                ...config.header,
                                token: loginres.data.data.accessToken,
                            };
                            resolve(config);
                        },
                    });
                } else {
                    reject("登录失败！" + res.errMsg);
                }
            },
        });
    })
}
let islogin = false; // 是否在登录进程中，是就不再调用，只需将请求排入队列中
let queryArr = []; // 请求队列

http.interceptors.request.use(
    async(config) => {
        /* 请求之前拦截器。可以使用async await 做异步操作 */
        config.header = {
            ...config.header,
            token: getTokenStorage() // 获取本地的token
        };
        // 请求时机改变，getApp实例在启动时未创建
        getApp().globalData.env = env;

        // 如果有token正常执行进程
        if (getTokenStorage()) {
            return config;
        } else {
            // 没有token先检查是否在登录进程中
            if (!islogin) {
                islogin = true
                login(config).then(callback => {
                    // 结束登录进程标识
                    islogin = false;
                    // 说明登录完成，并且callback返回了token,进行token更新
                    queryArr.map(cb => {
                        // map只是为了触发cb方法，并不指望拿到新的数组
                        cb(callback.header.token)
                    })
                })
            }
            // 不管是否在登录进程中都需要把正常请求流程的请求config存入队列，并在登录完成时触发resolve回调
            let proval = await new Promise((resolve, reject) => {
                // dt是在调用时传入的参数，await必须使用，否则无法阻止进程继续执行
                queryArr.push((dt) => {
                    /*将请求挂起*/
                    config.header.token = dt;
                    resolve(config);
                })
            });
            return proval
        }
    },
    (config) => {
        return Promise.reject(config);
    }
);

http.interceptors.response.use(
    async(response) => {
        /* 请求之后拦截器。可以使用async await 做异步操作  */
        if (response.data.status !== 200) {
            uni.showToast({
                title: response.data.msg,
                icon: 'none'
            })
            return Promise.reject(response)
        }
        if (checkUrl(response.config.url)) {
            return response.data;
        }
        return response;
    },
    (response) => {
        // 请求错误做点什么。可以使用async await 做异步操作
        return Promise.reject(response);
    }
);

export default http;
