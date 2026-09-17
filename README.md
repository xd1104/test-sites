# 測試站台冊

記錄測試網站資料的靜態網頁：系統別、貨幣、前端網址、BO 網址、測試帳密、備註。
取代原本記在 Notion 的那份清單。

**網址**：https://xd1104.github.io/test-sites/

## 資料放哪

這個 repo 是公開的，所以資料**不是**明文存放。

- 所有站台資料序列化成 JSON，用 AES-256-GCM 加密（PBKDF2-SHA256、250,000 次迭代）後存成 `data.enc`。
- 沒有通關密碼的人，抓到 `data.enc` 也只是一串 base64 亂碼。
- 密碼只存在使用者的瀏覽器（可選擇記住），不會進 repo、不會傳給任何伺服器。
- 密碼沒有後門，忘了就只能重建資料。

## 怎麼用

| 角色 | 要準備什麼 |
|---|---|
| 只看資料 | 通關密碼 |
| 要新增／修改 | 通關密碼 + GitHub personal access token（scope: `repo`） |

網頁上按儲存 → 重新加密 → 透過 GitHub Contents API commit 回這個 repo。
token 會用通關密碼再包一層，加密後存在瀏覽器的 localStorage，不會出現在頁面原始碼或 repo 裡。

兩個人同時改同一筆時，後存的那個會被 GitHub 擋下來（sha 不符），畫面會提示重新載入。

## 從 Notion 搬過來

Notion 資料庫 → `···` → Export → Markdown & CSV → 解壓縮拿 `.csv`。
在網頁的「設定 → CSV 匯入」選檔，下一步會列出 CSV 的欄位讓你對應到這邊的欄位（常見欄名會自動猜好），可以選擇「加在後面」或「整份取代」。

## 檔案

```
index.html   整個網站（沒有 build、沒有相依套件）
data.enc     加密後的資料，由網頁自己寫入
.nojekyll    讓 GitHub Pages 原樣提供檔案
```
