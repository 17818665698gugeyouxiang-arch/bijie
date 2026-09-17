# 联机模式部署说明

联机模式使用异步 Supabase 数据，不读取或写入 `game_progress`。应用数据库 migration 后，登录玩家首次点击“联机模式”才会创建一只联机猪。

## 应用数据库 migration

在 Supabase 项目的 SQL Editor 中执行完整文件 [supabase/migrations/002_online_social.sql](supabase/migrations/002_online_social.sql)，或在已认证的 Supabase CLI 环境中运行：

```powershell
supabase link --project-ref wevmotwnnzknfclloeyh
supabase db push
```

此 migration 创建：

- `online_profiles`：公开用户名、肘人累计、被肘累计。
- `online_elbow_records`：仅被肘者可读的、按攻击者／目标／分钟聚合的永久记录。
- `online_messages`：公开留言。
- 两个 `private` 限速表：每秒肘击计数与十秒留言计数。
- `create_online_profile()`、`online_elbow(uuid)`、`online_post_message(uuid, text)` 三个安全 RPC。

不要给浏览器授予 `service_role` key，也不要给 `authenticated` 用户直接写入 profile 累计值或被肘记录的权限。

## 验证顺序

1. 用账号 A 登录，点击“联机模式”；应创建 A 的 profile。
2. 用账号 B 登录，进入联机模式；用户列表应显示 A，选择 A 后可肘击。
3. A 刷新后，A 的“被肘”累计应增加；B 的“肘人”累计应增加。
4. 在一秒内连续完成超过五次肘击动作；动画持续播放，但数据库累计最多增加五次。
5. A 点击左侧“被肘记录”，应看到 B 在同一分钟内合并的记录；B 和第三方 C 无法读取 A 的记录表数据。
6. B 给 A 留言；A 和 C 都可查看。B 或 A 可删除该条留言，C 不可删除。
7. 在十秒内连续发送两条留言；第二条应由 RPC 拒绝，输入内容留在文本框中。

## 本地昼夜偏好

联机观看状态只在本机保存，key 格式为：

```
piggy-online-sky:<viewer-user-id>:<target-user-id>
```

因此同一浏览器中不同账号、不同目标猪的昼夜偏好不会互相覆盖，也不会上传到 Supabase。

## 回滚

前端可回到 `backup-pre-visual-redesign` 分支或 `pre-visual-redesign` 标签。数据库 migration 不会删除现有单人存档表；如需删除联机表，应另写审查后的回滚 migration，不能直接在生产环境手动删表。
