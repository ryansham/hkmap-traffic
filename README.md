# 香港智慧城市地圖

一幅可互動的香港地圖。底圖使用 [OpenFreeMap](https://openfreemap.org/) 的公開 Liberty 樣式。圖上有 98 個重鐵站和 1013 個運輸署交通快拍點。

點選車站可查看該站即將到站的列車。轉車站會列出經過的每一條綫。點選快拍點可查看該處最新照片。沒有班次或照片時，畫面會直接說明。

這幅圖的港鐵網絡，是有到站資料的十條重鐵綫，包括馬場站。輕鐵 68 個站和高鐵西九龍站不在這份到站資料內，所以沒有畫進網絡。

## 本地預覽

```bash
npm install
npm run dev
```

開發伺服器會在連接埠 47321 啟動。到站班次和快拍照片在瀏覽器裡直接向政府網站讀取，不需要 API 金鑰。

```bash
npm test
npm run build
```

`npm run data` 會重新下載港鐵路綫清單、地政總署車站範圍和運輸署快拍位置，並更新 `src/data/`。

## 資料來源

- 底圖：[OpenFreeMap Liberty](https://tiles.openfreemap.org/styles/liberty)
- 到站班次：[港鐵實時列車服務資訊](https://data.gov.hk/tc-data/dataset/mtr-data2-nexttrain-data)
- 路綫與站序：[港鐵綫（輕鐵除外）及車站](https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv)。馬場站不在這份清單，位置用地政總署的車站範圍補上。
- 車站位置：地政總署 CSDI 港鐵站範圍
- 交通快拍：[運輸署交通情況快拍圖像](https://data.gov.hk/tc-data/dataset/hk-td-tis_2-traffic-snapshot-images)

車站位置在建立時寫進專案，頁面不會每次向地政總署索取。到站和照片則在點開時即時讀取。

## 文件

架構和每一次發佈的紀錄以 [docs/](docs/README.md) 為準。改了使用者看得到的行為，就更新架構；每一次發佈都先在變更紀錄加一則。

## 發佈

現行正式版的地址，以及每一次發佈改了什麼，寫在 [docs/CHANGELOG.md](docs/CHANGELOG.md)。
