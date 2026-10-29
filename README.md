# goodbye to the future

黑白肃穆的多人纪念社区。用户可为人、物品、理想、记忆及抽象事物立碑；公开碑支持献花、实名或匿名评论。

## 当前预览

本机预览已实现登录入口、登录后立碑、公开/私密选项、图片选择、墓碑样式、献花与可选匿名留言。没有连接云端时，演示数据仅存于浏览器。

创建者还可以“回来扫墓”：为自己的碑留下带日期的新回访文字，并决定这条回访是否对访客可见。

## 启用真实多人版

1. 创建一个 Supabase 项目。
2. 在 SQL Editor 中执行 [`supabase-schema.sql`](supabase-schema.sql)。
3. 在 Auth 中启用 Email OTP 和 GitHub OAuth，并配置 GitHub Pages 的回调地址。
4. 将 `app.js` 中的本地演示数据层替换为 Supabase Auth、Database 与 Storage 调用；只把 publishable key 放进前端，绝不可放入 service_role key。
5. 通过 Edge Function 为私密图片生成短期签名 URL，并实现评论审核/举报后台。
6. 发布前端到 GitHub Pages。

`memorial-media` 是私有图片桶，公开图片也不要把整个桶设为 public；由服务端在验证墓碑可见性后返回签名 URL。

