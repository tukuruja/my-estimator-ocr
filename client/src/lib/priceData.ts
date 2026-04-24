// ====================================================
// 地盤条件・ほぐし係数（SiteConditionFactors）
// 根拠: 国土交通省 土木工事積算基準 土量換算係数L値
// ====================================================
export const groundConditions = [
  { name: '砂質土（標準）',     looseningFactor: 1.25, description: '一般的な砂質土・砂礫土' },
  { name: '粘性土（軟弱）',     looseningFactor: 1.30, description: '粘性土・シルト質土' },
  { name: '礫質土',             looseningFactor: 1.20, description: '礫が多い土質' },
  { name: '岩盤（軟岩）',       looseningFactor: 1.40, description: '軟質岩・風化岩' },
  { name: '岩盤（硬岩）',       looseningFactor: 1.60, description: '硬質岩・花崗岩等' },
  { name: '改良土',             looseningFactor: 1.15, description: 'セメント改良・石灰改良後' },
  { name: '建設発生土（再利用）',looseningFactor: 1.10, description: '既に一度掘削された土' },
] as const;

export type GroundConditionName = (typeof groundConditions)[number]['name'];

export function getLooseningFactor(groundConditionName: string): number {
  const found = groundConditions.find((g) => g.name === groundConditionName);
  return found?.looseningFactor ?? 1.25; // デフォルト: 砂質土標準
}

// 二次製品マスターデータ
export const secondaryProducts = [
  { name: '1号ｺﾈｸﾄﾎｰﾙ R№2 H3060', price: 189490 },
  { name: '１号コネクトホール NO.2', price: 126309 },
  { name: 'マンホールカバー DMHB-R2P', price: 108000 },
  { name: '０号コネクトホール NO.1', price: 102920 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 管取付壁 A1-H1800 接着式', price: 81840 },
  { name: '横断U360', price: 80000 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 管取付壁 A1-H1500 接着式', price: 69260 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 管取付壁 A1-H900 接着式', price: 44080 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 管取付壁 AO-H900 接着式', price: 39100 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 管取付壁 AO-H900 接着式(2)', price: 39100 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 斜壁 A1-N600 接着式', price: 36490 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 斜壁 AO-N600 接着式', price: 35040 },
  { name: '鋳鉄製防護蓋KSH-20セット汚水', price: 31360 },
  { name: 'ｸﾞﾚｰﾁﾝｸﾞ桝穴500角ﾎﾞﾙﾄ固定 T14 枠共', price: 30800 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 直壁 A1-S600 接着式', price: 29820 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 斜壁 A1-N450 接着式', price: 29120 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 斜壁 AO-N450 接着式', price: 27730 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 底版 A1-B 接着式', price: 23200 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 底版 A1-B 接着式(2)', price: 23200 },
  { name: 'エスビック社製 ピンコロ 90角', price: 22000 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 底版 AO-B 接着式', price: 19720 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 底版 AO-B 接着式(2)', price: 19720 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 直壁 A1-S300 接着式', price: 19720 },
  { name: 'フレッシュコンクリート受け入れ検査', price: 17000 },
  { name: 'コネクト調整リング A-R150 φ600', price: 13400 },
  { name: '横断暗渠ﾌﾞﾛｯｸ240 ﾀｲﾌﾟ2 T-14 L-1000', price: 10460 },
  { name: 'コネクト調整リング A-R100 φ600', price: 9570 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 削孔費 塩ビ管 φ200', price: 7310 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 削孔費 塩ビ管 φ200(2)', price: 7310 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 削孔費 塩ビ管 φ200', price: 7310 },
  { name: 'LU街渠240縁塊平5c T-14', price: 7000 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 削孔費 塩ビ管 φ150', price: 6160 },
  { name: '0号ｺﾈｸﾄﾎｰﾙ 削孔費 塩ビ管 φ150(2)', price: 6160 },
  { name: '1号ｺﾈｸﾄﾎｰﾙ 削孔費 塩ビ管 φ150', price: 6160 },
  { name: '鉄L250B斜左右10-5', price: 5500 },
  { name: '鉄L250B斜左右', price: 5200 },
  { name: 'CD桝側塊450ｘ300ｈ', price: 5100 },
  { name: 'U字溝360', price: 4850 },
  { name: 'LU街渠U240', price: 4500 },
  { name: 'CD桝側塊600x100h', price: 4200 },
  { name: 'LU街渠L240平5c T-14', price: 4100 },
  { name: '両R200斜10ｃ左右', price: 3800 },
  { name: 'CD桝450・縁塊', price: 3700 },
  { name: 'CD桝側塊450ｘ150ｈ', price: 3500 },
  { name: '公的圧縮依頼', price: 3500 },
  { name: 'CD桝側塊300ｘ300ｈ', price: 3400 },
  { name: '歩車道 A 1.0R', price: 3300 },
  { name: '溜（角）桝240X370', price: 3200 },
  { name: '鉄L250B平5ｃ', price: 3100 },
  { name: '鉄L250B平5ｃ(2)', price: 3100 },
  { name: 'U字溝240', price: 2800 },
  { name: 'コネクト受枠ボルト L＝300 ﾅｯﾄﾜｯｼｬｰ付', price: 2600 },
  { name: '鉄L250A平5ｃ', price: 2010 },
  { name: '地先 B斜左右7c', price: 1900 },
  { name: '公団ブロック100 斜左右2c', price: 1800 },
  { name: '公団ブロックK-104 斜左右', price: 1700 },
  { name: 'コネクト受枠ボルト L＝250 ﾅｯﾄﾜｯｼｬｰ付', price: 1600 },
  { name: '内蓋ITO-R200', price: 1500 },
  { name: 'U字溝180', price: 1400 },
  { name: '歩車道A平10ｃ', price: 1300 },
  { name: '地先 B平7c', price: 1200 },
  { name: '公団ブロック100 斜右2ｃ', price: 1100 },
  { name: '公団ブロック斜2ｃ 左', price: 1100 },
  { name: '歩車道A マモノ 片面', price: 1000 },
  { name: 'リブロック150 ブラウン コーナー', price: 950 },
  { name: '地先 Cメンなし', price: 900 },
  { name: '地先 B平10c', price: 850 },
  { name: 'リブロック150 ブラウン 基本', price: 800 },
  { name: '地先 Bメントリ', price: 750 },
  { name: '地先 Bメントリ(2)', price: 750 },
  { name: '地先 Bメントリ(3)', price: 750 },
  { name: '地先 Aメンなし', price: 700 },
  { name: '地先 Aメンなし(2)', price: 700 },
  { name: '地先 Aメンなし(3)', price: 700 },
  { name: 'リブロックF120 ブラウン コーナー', price: 650 },
  { name: 'リブロックF120 ブラウン 兼用', price: 600 },
  { name: 'ウルトラC126ﾐｽﾃｨﾍﾞｰｼﾞｭ コーナー', price: 550 },
  { name: 'ウルトラC126ﾐｽﾃｨﾍﾞｰｼﾞｭ 基本', price: 500 },
  { name: 'ボルトキャップ', price: 450 },
  { name: 'CBラクメジ15 コーナー', price: 400 },
  { name: 'CBラクメジ15 基本', price: 350 },
  { name: 'テスト2次製品', price: 100 },
];

// バックホーマスターデータ
export const backhoes = [
  { name: '0.10BH', price: 5880, capacity: 0.10 },
  { name: '0.12BH', price: 7980, capacity: 0.12 },
  { name: '0.15BH', price: 7980, capacity: 0.15 },
  { name: '0.20BH', price: 9280, capacity: 0.20 },
  { name: '0.25BH', price: 13110, capacity: 0.25 },
  { name: '0.40BH', price: 14630, capacity: 0.40 },
  { name: '0.45BH', price: 14630, capacity: 0.45 },
  { name: '0.70BH', price: 14630, capacity: 0.70 },
  { name: 'バックホー後方小旋回配管 0.12m3/CP/BL/PAD/3次 油圧圧砕機大割 0.1m3/ダブルシリンダー', price: 21000, capacity: 0.12 },
  { name: 'BH後方小旋回配管C 0.15m3/900kg/CP/BL/ｵﾌ 油圧圧砕機大割 0.1m3/ﾀﾞﾌﾞﾙｼﾘﾝﾀﾞｰ', price: 19000, capacity: 0.15 },
  { name: 'バックホー小旋回スライド 0.25m3/CB/AC/PAD/オフ2011年規', price: 18800, capacity: 0.25 },
  { name: 'BH後方小旋回配管C 0.25ｍ3/2.5tCB/PAD/オフ2014年規', price: 14630, capacity: 0.25 },
  { name: 'BH後方小旋回配スライド 0.12ｍ3', price: 14530, capacity: 0.12 },
  { name: 'バックホー後方小旋回配管 0.12m3/CP/BL/PAD/3次 ブレーカー/油 0.1ｍ3', price: 12630, capacity: 0.12 },
  { name: 'BH後方小旋回配管C 0.15m3/900kg/CP/BL/オフ', price: 7100, capacity: 0.15 },
  { name: 'バックホー小旋回クレーン 0.12m3/900kg/CP/BL/HL/SHOEオフ', price: 6600, capacity: 0.12 },
  { name: 'バックホー小旋回 0.1m3/CP/BL/SHOE/3次', price: 5600, capacity: 0.10 },
  { name: 'バックホー小旋回 0.07m3/CP/BL/SHOE/オフ', price: 5100, capacity: 0.07 },
  { name: 'バックホー小旋回クレーン 0.25m3/1.7t/CB/PAD/オフ2014年', price: 3460, capacity: 0.25 },
  { name: 'バックホー小旋回クレーン 0.25ｍ3/1.3t/CB/PAD/オフ', price: 3360, capacity: 0.25 },
  { name: 'バックホー小旋回クレーン 0.12ｍ3/900kg/CP/BL/SHOE/オフ', price: 2600, capacity: 0.12 },
  { name: 'バックホー小旋回 0.07m3/CP/BL/SHOE/オフ', price: 0, capacity: 0.07 },
  { name: '解体BHクレーン後方 0.45m3/小池組 油圧圧砕機小割 0.45m3/小池組', price: 29650, capacity: 0.45 },
];

// ダンプマスターデータ
export const dumpTrucks = [
  { name: '2Tダンプ 1.75m3', price: 14000, capacity: 1.75 },
  { name: '3Tダンプ 2.00m3', price: 16000, capacity: 2.00 },
  { name: '4Tダンプ 3.00m3', price: 28000, capacity: 3.00 },
  { name: '8Tダンプ 5.00m3', price: 29000, capacity: 5.00 },
  { name: '10Tダンプ 6.00m3', price: 36000, capacity: 6.00 },
  { name: '2Tダンプ 1.50m3', price: 14000, capacity: 1.50 },
  { name: '3Tダンプ 2.50m3', price: 16000, capacity: 2.50 },
  { name: '4Tダンプ 3.50m3', price: 45000, capacity: 3.50 },
  { name: '8Tダンプ 7.50m3', price: 35000, capacity: 7.50 },
  { name: '10Tダンプ 9.50m3', price: 36000, capacity: 9.50 },
];

// 砕石マスターデータ
export const crushedStones = [
  { name: 'RC-40 3300円', price: 3300 },
  { name: 'RC-40 3500円', price: 3500 },
  { name: 'RC-40 4000円', price: 4000 },
  { name: 'RC-40 4300円', price: 4300 },
  { name: 'RC-40 4500円', price: 4500 },
  { name: 'RC-40 5000円', price: 5000 },
  { name: 'RC-40 5500円', price: 5500 },
  { name: 'C-40 8000円', price: 8000 },
];

// 生コンマスターデータ
export const concretes = [
  { name: '生コン21-15-20', price: 30000 },
  { name: '生コン18-15-20', price: 26200 },
  { name: 'モルタル 1：3', price: 26000 },
  { name: '生コン21-18-20', price: 22800 },
  { name: '生コン 18-18-20', price: 22500 },
  { name: '生コン 24-15-20', price: 22150 },
  { name: '現場待機料 160分', price: 22000 },
  { name: '生コン 21-15-20', price: 21600 },
  { name: '生コン21-18-20', price: 20900 },
  { name: '生コン 24-18-20（0.75）', price: 20650 },
  { name: '生コン24-15-20', price: 20300 },
  { name: '生コン 18-18', price: 20000 },
  { name: '残コン処理', price: 20000 },
  { name: '21-15-20', price: 19950 },
  { name: '生コン 24-21-20', price: 19850 },
  { name: '生コン18-08-20', price: 19800 },
  { name: '生コン 18-18-20', price: 19700 },
  { name: '生コン 24-18-20', price: 19650 },
  { name: '生コン 21-18', price: 19500 },
  { name: '生コン 21-18-20', price: 19300 },
  { name: '生コン 24-15-20', price: 19300 },
  { name: '生コン 21-18-20(2)', price: 19300 },
  { name: '生コン18-08-20(2)', price: 19300 },
  { name: '生コン 18-18', price: 19200 },
  { name: '生コン 18-18(2)', price: 19000 },
  { name: '生コン 18-18(3)', price: 19000 },
  { name: '生コン 18-18-20(2)', price: 19000 },
  { name: '生コン 21-18(2)', price: 19000 },
  { name: '生コン21-18-20(2)', price: 19000 },
  { name: '生コン 18-08-20', price: 18800 },
  { name: '生コン 18-12-20', price: 18500 },
  { name: '生コン 18-15-20', price: 18300 },
  { name: '生コン 24-15-20', price: 18100 },
  { name: '生コン 18-18（Jisなし）', price: 17800 },
  { name: '生コン 18-18（Jisなし）(2)', price: 17500 },
  { name: '生コン 18-18（Jisなし）(3)', price: 17200 },
  { name: '生コン 18-18（Jisあり）', price: 17000 },
  { name: '生コン 18-18（Jisあり）(2)', price: 16800 },
  { name: '生コン 18-18（Jisあり）(3)', price: 16500 },
  { name: '生コン 18-18-20(3)', price: 16200 },
  { name: '生コン 18-18-20(4)', price: 16000 },
  { name: '生コン 21-15-20', price: 15800 },
  { name: '生コン 18-10-20', price: 15500 },
  { name: '生コン 18-15-20(2)', price: 15200 },
  { name: '生コン 21-18-20(3)', price: 15000 },
  { name: '生コン 21-18-20（JIS規格）', price: 14800 },
  { name: '生コン 18-18-20(5)', price: 14500 },
  { name: '生コン 18-18-20(6)', price: 14200 },
  { name: '荷下し超過時間 70分', price: 14000 },
  { name: '流動化処理土（1回転）', price: 13500 },
  { name: 'スラモル C-50', price: 13000 },
  { name: '残コン処理', price: 12500 },
  { name: '残コン処理 戻り0.5ｍ3', price: 12000 },
  { name: '少量割増', price: 11500 },
  { name: '生コン少量割増', price: 11000 },
  { name: '少量割増(2)', price: 10500 },
  { name: '少量割増(3)', price: 10000 },
  { name: '少量割増(4)', price: 9500 },
  { name: '小口割増', price: 9000 },
  { name: 'テストB', price: 8500 },
];

// ポンプ車マスターデータ
export const pumpTrucks = [
  { name: 'ポンプ1日', price: 56000 },
  { name: 'ポンプ半日', price: 36000 },
  { name: '機械ねこ', price: 18000 },
];

// 製品長さ選択肢
export const productLengths = [
  { name: '0.4', value: 0.4 },
  { name: '0.6', value: 0.6 },
  { name: '1.0', value: 1.0 },
  { name: '2.0', value: 2.0 },
];

// 施工性係数選択肢
export const workabilityFactors = [
  { name: '0.1', value: 0.1 },
  { name: '1.3', value: 1.3 },
  { name: '1.4', value: 1.4 },
  { name: '1.5', value: 1.5 },
  { name: '1.6', value: 1.6 },
  { name: '1.7', value: 1.7 },
  { name: '1.8', value: 1.8 },
  { name: '1.9', value: 1.9 },
  { name: '2.0', value: 2.0 },
  { name: '2.5', value: 2.5 },
  { name: '3.0', value: 3.0 },
  { name: '3.5', value: 3.5 },
  { name: '0.5', value: 0.5 },
  { name: '0.3', value: 0.3 },
];

// 4時間掘削量係数
export function getFourHourExcavationCoefficient(capacity: number): number {
  // 機械容量に基づく4時間掘削量の係数
  // 0.20BHの場合: 115.2 / 0.20 = 576 → 576 * capacity
  // 実際のデータから推定
  if (capacity <= 0.07) return 300;
  if (capacity <= 0.10) return 400;
  if (capacity <= 0.12) return 480;
  if (capacity <= 0.15) return 520;
  if (capacity <= 0.20) return 576;
  if (capacity <= 0.25) return 600;
  if (capacity <= 0.40) return 650;
  if (capacity <= 0.45) return 700;
  return 750;
}

// 打設人数の決定
export function getPouringWorkers(concreteVolume: number): number {
  if (concreteVolume <= 2) return 5;
  if (concreteVolume <= 4) return 6;
  if (concreteVolume <= 6) return 7;
  if (concreteVolume <= 8) return 9;
  if (concreteVolume <= 10) return 10;
  if (concreteVolume <= 15) return 12;
  if (concreteVolume <= 20) return 14;
  return 16;
}

