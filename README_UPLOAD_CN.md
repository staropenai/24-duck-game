# 24 Duck Game 静态网站上传包

这个包是给“发链接给家人玩”的版本。

它不是 iPhone `.ipa`，不是 Android `.apk`，也不是微信小程序。它是一个可上传到 HTTPS 静态网站的前端网页包。

## 最推荐用法

1. 解压 `24-Duck-Game-Static-Site-Upload.zip`。
2. 把解压后的文件夹内容上传到 HTTPS 静态网站空间。
   - Cloudflare Pages
   - Netlify
   - Vercel
   - GitHub Pages
   - 自己的静态服务器
3. 上传后打开网站根地址，确认能看到 24 Duck Game。
4. 把网站链接发给家人。

## 家人在手机上怎么用

iPhone:

1. 用 Safari 打开你发的链接。
2. 点分享按钮。
3. 选择“添加到主屏幕”。

Android:

1. 用 Chrome 打开你发的链接。
2. 点右上角菜单。
3. 选择“安装应用”或“添加到主屏幕”。

## 微信能不能直接发 zip 自动安装？

不能。

微信可以发链接，也可以发 zip 文件，但 zip 不会在手机上自动安装成 App。

## 当前边界

- 不上传照片到外部服务，除非你自己把这个包上传到静态网站。
- 不含后台服务器。
- 不含账号系统。
- 不含支付。
- 不含 App Store / TestFlight / APK / 小程序工程。
- 当前适合家庭试玩和数学训练验证。

## 如果下一步要做真正手机 App

可选路线：

1. Android APK：需要新建 Android 包装工程、签名、安装说明。
2. iPhone App：需要 Apple Developer、TestFlight 或 App Store。
3. 微信小程序：需要重新做小程序工程和审核。
4. PWA 网页：当前包就是这个方向，最快、最轻、最适合先测试。

## App Store 注意

这个静态网站包可以作为家人手机测试链接，但不能直接上传 App Store。正式上架需要 native iOS 工程或足够原生价值的封装、App Store Connect 元数据、隐私政策 URL、年龄分级、截图、真机测试、TestFlight，以及素材授权确认。
