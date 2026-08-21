import {
  breed,
  classifyShapeCategory,
  compatibility,
  createFounderGenome,
  type Genome,
  type ShapeCategory,
} from "./genome";
import { createCreature, type Creature } from "./creature";
import type { DecorPlacement } from "./decor";
import { rainbowIntensityForTime, meteorShowerIntensityForTime } from "./season";
import { decorShapeForUnlockId } from "./unlocks";
import { easterEggStateForTime, type VisitorKind } from "./easterEgg";

/**
 * 幫活動持續時間加一點隨機浮動（0.6x～1.4x）。
 * 沒有這個的話，所有生物一開始都在同一個 tick 擲骰，只要持續維持 wander，
 * 每次都是固定 wanderRetargetSeconds，等於全部生物會在完全相同的時間點同步換方向——
 * 看起來像被同一隻手操控，很不自然。加了浮動之後，第二輪就會各自散開成不同節奏。
 */
function jitterDuration(base: number): number {
  return base * (0.6 + Math.random() * 0.8);
}

/** 32-bit 字串雜湊，只用來把生物 id 轉成看起來隨機、但每次算出來都一樣的相位，見 stepCreatures 的耐風搖擺。 */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 手足外形不同：把連續的 hue（0..360）切成 6 個色系，供「同一對父母生出的子女彼此顏色/外形不重複」判斷用
// （見 performBreed 的 siblingSignature）。跟外形分類（ShapeCategory）一起組成「顏色+外形」簽章。
const SIBLING_COLOR_BUCKETS = 6;
function siblingColorBucket(hue: number): number {
  const h = ((hue % 360) + 360) % 360;
  return Math.floor(h / (360 / SIBLING_COLOR_BUCKETS)) % SIBLING_COLOR_BUCKETS;
}

function siblingSignature(genome: Genome): string {
  return `${classifyShapeCategory(genome)}|${siblingColorBucket(genome.visual.hue)}`;
}

// 訪客沾染／血脈：見 Creature.taintedBy 跟 Genome.visitorLineage 的註解。兩個獨立機率——
// 沾染是「摸到訪客可見期間的寵物」，血脈是「沾染/帶血脈的親代生小孩時，往下傳一次」，
// 跟 genome.ts 的 RARE_MUTATION_CHANCE 同一種「模組常數」層級，不放進 SimulationConfig。
const VISITOR_TAINT_CHANCE = 0.15;
const VISITOR_LINEAGE_INHERIT_CHANCE = 0.3;

export interface TerrariumBounds {
  width: number;
  height: number;
}

export interface SimulationConfig {
  bounds: TerrariumBounds;
  populationCap: number;
  matingRadius: number;
  baseBreedRatePerSecond: number; // chance density before compatibility scaling
  cooldownSeconds: number;
  maxChildrenPerPair: number; // 一對伴侶一生最多生幾隻，達到上限後維持配對但不再生育
  birthEventCooldownSeconds: number; // 全域節奏：不管有幾對伴侶符合條件，整個生態瓶大約多久才會有一次新生命的消息
  wanderRetargetSeconds: number;
  petCooldownSeconds: number;
  petCompanionBonusSeconds: number; // 每次成功摸摸，額外加到「陪伴天數」的秒數（見 unlocks.ts 的 companionDays）
  feedCompanionBonusSeconds: number; // 每次有生物吃到食物，額外加到「陪伴天數」的秒數
  sleepChance: number; // 每次重新擲骰活動時，進入睡眠的機率
  sleepDurationSeconds: number;
  decorVisitChance: number; // 剛好在裝飾物附近時，停下來逗留的機率
  decorVisitDurationSeconds: number;
  decorVisitRadius: number; // 世界單位（絕對值，不用跟著場地比例縮放——裝飾物本身大小是固定的）
  // 「個性」偏好（見 personality.ts）：路過自己最愛的裝飾物時，感應範圍/逗留機率/逗留時間
  // 都會被放大這幾個倍率，但仍然是「路過剛好停下來」，不會從遠處被拉過去——只是喜歡的裝飾
  // 感應泡泡變大、更容易被命中，維持跟一般裝飾一樣的行為模式，只是機率上更偏好。
  favoriteDecorRadiusMultiplier: number;
  favoriteDecorChanceMultiplier: number;
  favoriteDecorDurationMultiplier: number;
  foodNoticeRadius: number; // 生物擲骰時，食物在這個範圍內才有機會被注意到
  foodAttractChance: number;
  foodMaxSeekers: number; // 同一份食物最多同時吸引幾隻過去，避免十幾隻疊在同一點上
  foodEatRadius: number; // 走到食物這麼近就算吃到
  foodTravelTimeoutSeconds: number; // 食物太遠走不到時的保底逾時，逾時就放棄回到漫遊
  maxFoodItems: number; // 場上食物數量上限，超過會先移除最舊的一份
}

export const DEFAULT_CONFIG: SimulationConfig = {
  bounds: { width: 96, height: 56 },
  populationCap: 20,
  // 場地邊長再放大 2 倍（面積 4 倍），加上拿掉了區域拉力（不再往固定地點聚集），
  // 相遇機率會被稀釋很多，把相遇判定半徑同比例放大，減緩繁殖幾乎停滯的問題。
  matingRadius: 3.6,
  baseBreedRatePerSecond: 0.03,
  cooldownSeconds: 90,
  maxChildrenPerPair: 3,
  // 呼應晝夜循環一天＝360 遊戲秒（見 environment.ts 的 DAY_LENGTH_SECONDS）：整個生態瓶大約
  // 一天只會有一次新生命的消息，不管當下有幾對伴侶都符合條件，營造「像新聞速報」的節奏感，
  // 而不是背景一直有生物在生。快轉時這個節奏也會跟著變快，跟晝夜循環一致。
  birthEventCooldownSeconds: 360,
  wanderRetargetSeconds: 4,
  // 摸摸／餵食都會加快「陪伴天數」門檻的解鎖（見 unlocks.ts 的 companionDays）——
  // 主動互動換來實質進度，但幅度刻意不大：30 分鐘/60 分鐘換算成秒數，
  // 陪一整天（86400 秒）大約要摸 48 次或餵到 24 次才等於免費多一天，不會讓互動變成
  // 唯一有效率的解鎖手段，純掛機陪伴依然是最主要的路徑。
  petCooldownSeconds: 20,
  petCompanionBonusSeconds: 30 * 60,
  feedCompanionBonusSeconds: 60 * 60,
  sleepChance: 0.12,
  sleepDurationSeconds: 10,
  // 裝飾物逗留：只在剛好走到裝飾物附近時才會觸發（不會從遠處被吸引過來——
  // 場地現在有 96×56 那麼大，走過去的時間會比逗留時間還長，體驗上只會看到
  // 「一直往某個方向走但還沒到就結束了」，所以改成純粹「路過剛好停下來」）。
  decorVisitChance: 0.35,
  decorVisitDurationSeconds: 8,
  decorVisitRadius: 3,
  favoriteDecorRadiusMultiplier: 2,
  favoriteDecorChanceMultiplier: 2,
  favoriteDecorDurationMultiplier: 1.8,
  // 餵食：跟裝飾物不同，食物是玩家當下主動丟的、通常就在螢幕範圍內看著，
  // 值得讓生物專程從稍遠的地方走過去，才會有「牠注意到然後走過來吃」的效果。
  // 放置本身沒有冷卻（餵食模式下可以連續點），靠 maxFoodItems 避免場上堆積過多。
  foodNoticeRadius: 16,
  foodAttractChance: 0.5,
  // 沒有上限的話，一份食物在偵測範圍內會持續吸引每隻剛好擲骰到的生物，
  // 場地縮小、族群沒那麼分散之後，很容易十幾隻同時往同一個點擠過去、疊在一起。
  foodMaxSeekers: 3,
  foodEatRadius: 0.7,
  foodTravelTimeoutSeconds: 30,
  maxFoodItems: 20,
};

export interface FoodItem {
  id: string;
  x: number;
  y: number;
}

export interface FeedEvent {
  creatureId: string;
  x: number;
  y: number;
}

export interface BreedEvent {
  parentAId: string;
  parentBId: string;
  child: Creature;
  /** 若族群已達上限，新生命誕生時會有一位「元老」退場讓出位置；這裡回傳被退場的個體。 */
  retired?: Creature;
}

export interface SeenSpectrum {
  sun: boolean;
  moisture: boolean;
  wind: boolean;
  shade: boolean;
}

/** 圖鑑的一筆歷史紀錄：只要出生過就會留一筆，不會因為「元老退場」而消失。 */
export interface DiscoveredCreature {
  id: string;
  name: string;
  genome: Genome;
  tier: ShapeCategory;
  bornAt: number; // game-seconds
  parentIds: [string, string] | null; // 始祖是 null，供圖鑑點開個體時顯示家庭關係
}

export type SimulationListener = (event: BreedEvent) => void;

export class Simulation {
  config: SimulationConfig;
  creatures: Creature[] = [];
  time = 0; // game-seconds since simulation epoch
  totalBirths = 0;
  lastBirthAt = -Infinity; // 全域生育節奏用，見 resolvePairedBreeding 的 birthEventCooldownSeconds；有存讀檔
  /** 圖鑑用的「曾經觀察過」紀錄，跟目前存活族群脫鉤，才不會因為元老退場而讓已達成的收藏條件又消失。 */
  seenRareCreature = false;
  seenSpectrum: SeenSpectrum = { sun: false, moisture: false, wind: false, shade: false };
  /** 跟上面兩個一樣是「曾經觀察過」的累積旗標，只是觀察的對象是稀有天氣（見 observeRareWeather）。 */
  seenRainbow = false;
  seenMeteorShower = false;
  /** 稀有訪客要玩家主動點到才算「找到」，不是自動觀察到就算——見 markVisitorFound。
   *  記錄的是「哪些種類」被找到過（見 easterEgg.ts 的 VisitorKind），供圖鑑子圖鑑顯示收集進度。 */
  seenVisitorKinds: Set<VisitorKind> = new Set();
  /** 歷來有沒有出生過帶「訪客血脈」（genome.visitorLineage）的個體，累積旗標，見 observeGenome。 */
  seenVisitorLineage = false;
  /** 圖鑑：歷來出現過的每一隻個體都會留一筆紀錄，見 observeGenome。 */
  discoveredCreatures: DiscoveredCreature[] = [];
  /** 場上還沒被吃掉的食物，見 dropFood/stepCreatures。 */
  foodItems: FoodItem[] = [];
  /** 摸摸/餵食累積起來的額外「陪伴天數」秒數，見 unlocks.ts 的 companionDays。 */
  interactionBonusSeconds = 0;
  private listeners: SimulationListener[] = [];
  private feedListeners: ((event: FeedEvent) => void)[] = [];
  private decorPlacements: DecorPlacement[] = [];
  private nextFoodId = 0;

  constructor(config: SimulationConfig = DEFAULT_CONFIG) {
    // 淺拷貝，避免多個 Simulation 實例（或後續解鎖效果）共用同一個 DEFAULT_CONFIG 物件而互相汙染
    this.config = { ...config };
  }

  onBreed(listener: SimulationListener): void {
    this.listeners.push(listener);
  }

  /** 生物吃到食物時觸發，供 main.ts 顯示提示/特效。 */
  onFeed(listener: (event: FeedEvent) => void): void {
    this.feedListeners.push(listener);
  }

  /** 場景（main.ts）擺放/載入裝飾物時同步過來，供 stepCreatures 判斷附近有沒有裝飾物可以逗留。 */
  setDecorPlacements(placements: readonly DecorPlacement[]): void {
    this.decorPlacements = [...placements];
  }

  /** 玩家點到稀有訪客，標記這個種類被找到過了（見 unlocks.ts 的 codex-easter-egg、codexPanel 的
   *  稀有訪客子圖鑑）。訪客本身不屬於基因/繁殖系統，這裡只是單純記一筆旗標，沒有其他數值效果。 */
  markVisitorFound(kind: VisitorKind): void {
    this.seenVisitorKinds.add(kind);
  }

  /** 摸摸：互動回饋（愛心特效/提示交給 UI 層）。回傳是否實際生效（冷卻中則忽略），以及這次摸摸
   *  有沒有剛好讓這隻寵物「沾染」上稀有訪客（訪客當下必須可見，見 easterEgg.ts 的 easterEggStateForTime）——
   *  沾染本身終生保留、不影響外觀，只是繁殖時「有機會把訪客血脈傳給下一代」的潛在因子，見 performBreed。 */
  pet(creatureId: string): { petted: boolean; newlyTainted: boolean } {
    const creature = this.creatures.find((c) => c.id === creatureId);
    if (!creature) return { petted: false, newlyTainted: false };
    if (this.time - creature.lastPettedAt < this.config.petCooldownSeconds) return { petted: false, newlyTainted: false };
    creature.lastPettedAt = this.time;
    this.interactionBonusSeconds += this.config.petCompanionBonusSeconds;

    let newlyTainted = false;
    const visitor = easterEggStateForTime(this.time);
    if (visitor.visible && Math.random() < VISITOR_TAINT_CHANCE) {
      creature.taintedBy = visitor.kind;
      newlyTainted = true;
    }
    return { petted: true, newlyTainted };
  }

  /** 改名：只改目前存活的個體；圖鑑裡對應的歷史紀錄也一併同步，讓收藏頁看到的名字一致。回傳是否成功（找不到該 id 則失敗）。 */
  renameCreature(creatureId: string, name: string): boolean {
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) return false;
    const creature = this.creatures.find((c) => c.id === creatureId);
    if (!creature) return false;
    creature.name = trimmed;
    const discovered = this.discoveredCreatures.find((d) => d.id === creatureId);
    if (discovered) discovered.name = trimmed;
    return true;
  }

  /** 丟食物：在指定世界座標放一份食物，之後生物擲骰活動時如果剛好在偵測範圍內，有機會走過去吃掉。沒有冷卻，餵食模式下可以連續放。 */
  dropFood(x: number, y: number): boolean {
    this.nextFoodId += 1;
    this.foodItems.push({ id: `food${this.nextFoodId}`, x, y });
    if (this.foodItems.length > this.config.maxFoodItems) this.foodItems.shift();
    return true;
  }

  seedFounders(count: number, genomes?: Genome[]): void {
    const { width, height } = this.config.bounds;
    for (let i = 0; i < count; i++) {
      const genome = genomes?.[i] ?? createFounderGenome(i);
      const x = (Math.random() - 0.5) * width * 0.7;
      const y = (Math.random() - 0.5) * height * 0.7;
      const creature = createCreature(genome, x, y, this.time);
      this.creatures.push(creature);
      this.observeGenome(creature);
    }
  }

  /** 圖鑑觀察紀錄只會累積、不會因為個體退場而回退——每隻出生過的個體都留一筆。 */
  private observeGenome(creature: Creature): void {
    const genome = creature.genome;
    if (genome.rare) this.seenRareCreature = true;
    if (genome.visitorLineage) this.seenVisitorLineage = true;
    const e = genome.elements;
    if (e.sun >= 0.8) this.seenSpectrum.sun = true;
    if (e.moisture >= 0.8) this.seenSpectrum.moisture = true;
    if (e.wind >= 0.8) this.seenSpectrum.wind = true;
    if (e.shade >= 0.8) this.seenSpectrum.shade = true;

    this.discoveredCreatures.push({
      id: creature.id,
      name: creature.name,
      genome,
      tier: classifyShapeCategory(genome),
      bornAt: creature.bornAt,
      parentIds: creature.parentIds,
    });
  }

  /** 推進模擬 dt 個「遊戲秒」。可在離線結算時以較大 dt 分段呼叫。 */
  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    this.stepCreatures(dt);
    this.resolveBreeding(dt);
    this.observeRareWeather();
  }

  /** 圖鑑用的「曾經看過彩虹/流星雨」旗標，跟基因觀察紀錄同一套邏輯——只會累積、不會因為
   *  當下沒有天氣事件而回退。彩虹/流星雨本身純粹是 sim.time 的函式（見 season.ts），
   *  離線結算用大 dt 分段呼叫 update 時也會逐段檢查到，不會因為跳著算而漏掉。 */
  private observeRareWeather(): void {
    if (!this.seenRainbow && rainbowIntensityForTime(this.time) > 0.05) this.seenRainbow = true;
    if (!this.seenMeteorShower && meteorShowerIntensityForTime(this.time) > 0.05) this.seenMeteorShower = true;
  }

  /**
   * 行為狀態機：每隻生物到期（activityUntil）就重新擲骰決定下一段要 wander／sleep／decor／food。
   * wander 是純隨機方向漫步（撞牆反彈，沒有目標點，不會有偏向地圖中心的系統性偏誤）；
   * sleep 原地不動（renderer 畫 Zzz）；decor 是剛好路過裝飾物附近時就地停下逗留一段時間
   * （renderer 依 activityTargetId 對應的裝飾種類播放專屬小動畫），時間到再回到 wander；
   * decor 不會從遠處把生物拉過去——場地很大，走過去的時間常常比逗留時間還長，體驗上只會看到
   * 「一直往某方向走但還沒到就結束」，所以純粹是「路過剛好停下來」。food 則相反：食物是玩家
   * 當下主動丟的、通常正看著，值得專程走過去，所以會真的從稍遠處被吸引過去、直到吃到為止。
   */
  private stepCreatures(dt: number): void {
    const { width, height } = this.config.bounds;
    const halfW = width / 2;
    const halfH = height / 2;

    for (const c of this.creatures) {
      if (this.time >= c.activityUntil) this.rollActivity(c);

      if (c.activity === "food") {
        this.stepFoodSeeking(c);
      } else if (c.activity === "sleep" || c.activity === "decor") {
        c.vx = 0;
        c.vy = 0;
      } else {
        // 耐風傾向強的個體額外疊加一點方向搖擺，讓牠們看起來動得比較不規則——用平滑的 sin 波
        // 隨遊戲時間慢慢偏轉角度，不是每一影格重新擲一次隨機方向。舊寫法每一影格都重新隨機一次，
        // 而位移量是「方向 × dt」，dt 會隨著玩家選的模擬倍速（例如 20x）放大，等於每影格都在
        // 「毫無關聯的隨機方向」之間跳來跳去、又跳得更遠，看起來像在抖動，快轉時特別明顯、容易看暈。
        // 換成平滑波形後，角度隨遊戲時間連續變化，不管倍速多少都只是沿著同一條平滑曲線走得更快，
        // 不會有相鄰影格方向不連續的瞬間跳動。
        const windStrength = c.genome.elements.wind;
        const angle = Math.atan2(c.wanderDirY, c.wanderDirX) + Math.sin(this.time * 1.5 + hashString(c.id)) * windStrength * 0.22;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const maxSpeed = 0.5 * c.genome.visual.speed;
        c.vx = dirX * maxSpeed;
        c.vy = dirY * maxSpeed;
      }

      c.x += c.vx * dt;
      c.y += c.vy * dt;

      // 撞牆就反彈方向，而不是卡在邊界滑動、等下次隨機換方向才離開。
      if (c.x > halfW || c.x < -halfW) c.wanderDirX = -c.wanderDirX;
      if (c.y > halfH || c.y < -halfH) c.wanderDirY = -c.wanderDirY;
      c.x = Math.max(-halfW, Math.min(halfW, c.x));
      c.y = Math.max(-halfH, Math.min(halfH, c.y));
    }
  }

  /** food 活動的移動邏輯：朝食物直線前進，抵達範圍內就吃掉；食物如果已經不在了（被別隻吃掉）就放棄回到漫遊。 */
  private stepFoodSeeking(c: Creature): void {
    const food = this.foodItems.find((f) => f.id === c.activityTargetId);
    if (!food) {
      c.activity = "wander";
      c.activityUntil = this.time;
      c.vx = 0;
      c.vy = 0;
      return;
    }
    const dx = food.x - c.x;
    const dy = food.y - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.config.foodEatRadius) {
      const speed = 0.5 * c.genome.visual.speed;
      c.vx = (dx / dist) * speed;
      c.vy = (dy / dist) * speed;
    } else {
      c.vx = 0;
      c.vy = 0;
      this.eatFood(c, food);
    }
  }

  private eatFood(c: Creature, food: FoodItem): void {
    const idx = this.foodItems.indexOf(food);
    if (idx !== -1) this.foodItems.splice(idx, 1);
    c.activity = "wander";
    c.activityTargetId = null;
    c.activityUntil = this.time + jitterDuration(2); // 吃完稍微停一下再繼續漫遊，不要瞬間掉頭就走
    this.interactionBonusSeconds += this.config.feedCompanionBonusSeconds;
    for (const listener of this.feedListeners) listener({ creatureId: c.id, x: c.x, y: c.y });
  }

  /** 到期重新決定下一段行為：食物優先（玩家當下主動丟的），其次是裝飾物逗留，再來是睡覺，其餘維持漫遊。 */
  private rollActivity(c: Creature): void {
    const cfg = this.config;
    let nearbyFood = this.nearestFood(c, cfg.foodNoticeRadius);
    if (nearbyFood) {
      const seekers = this.creatures.filter((o) => o.activity === "food" && o.activityTargetId === nearbyFood!.id).length;
      // 已經有夠多隻在往這份食物走了，這次當作沒看到，不然大家都往同一點擠、疊成一團。
      if (seekers >= cfg.foodMaxSeekers) nearbyFood = null;
    }
    const nearbyDecorResult = this.nearestDecor(c, cfg.decorVisitRadius);
    const nearbyDecor = nearbyDecorResult?.placement ?? null;
    const decorIsFavorite = nearbyDecorResult?.isFavorite ?? false;
    const decorChance = decorIsFavorite ? cfg.decorVisitChance * cfg.favoriteDecorChanceMultiplier : cfg.decorVisitChance;
    const r = Math.random();

    let threshold = nearbyFood ? cfg.foodAttractChance : 0;
    if (nearbyFood && r < threshold) {
      c.activity = "food";
      c.activityTargetId = nearbyFood.id;
      c.activityUntil = this.time + cfg.foodTravelTimeoutSeconds;
      return;
    }

    if (nearbyDecor && r < threshold + decorChance) {
      c.activity = "decor";
      c.activityTargetId = nearbyDecor.unlockId;
      const duration = decorIsFavorite
        ? cfg.decorVisitDurationSeconds * cfg.favoriteDecorDurationMultiplier
        : cfg.decorVisitDurationSeconds;
      c.activityUntil = this.time + jitterDuration(duration);
      return;
    }
    threshold += nearbyDecor ? decorChance : 0;

    if (r < threshold + cfg.sleepChance) {
      c.activity = "sleep";
      c.activityTargetId = null;
      c.activityUntil = this.time + jitterDuration(cfg.sleepDurationSeconds);
      return;
    }

    c.activity = "wander";
    c.activityTargetId = null;
    const angle = Math.random() * Math.PI * 2;
    c.wanderDirX = Math.cos(angle);
    c.wanderDirY = Math.sin(angle);
    c.activityUntil = this.time + jitterDuration(cfg.wanderRetargetSeconds);
  }

  /** 找路過範圍內的裝飾物；喜歡的裝飾物（見 personality.ts 的 favoriteDecor）用放大過的感應半徑找、
   *  且優先於一般裝飾物——就算場上有更近的非喜歡裝飾，只要喜歡的落在放大後的範圍內就優先選它。
   *  找不到喜歡的才 fallback 回「範圍內最近」的一般邏輯，跟這個功能推出前的行為一致。 */
  private nearestDecor(c: Creature, radius: number): { placement: DecorPlacement; isFavorite: boolean } | null {
    const favoriteRadius = radius * this.config.favoriteDecorRadiusMultiplier;
    let best: DecorPlacement | null = null;
    let bestIsFavorite = false;
    let bestDistSq = Infinity;
    for (const p of this.decorPlacements) {
      const isFavorite = decorShapeForUnlockId(p.unlockId) === c.favoriteDecor;
      const r = isFavorite ? favoriteRadius : radius;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > r * r) continue;

      if (isFavorite && !bestIsFavorite) {
        best = p;
        bestIsFavorite = true;
        bestDistSq = distSq;
      } else if (isFavorite === bestIsFavorite && distSq < bestDistSq) {
        best = p;
        bestDistSq = distSq;
      }
    }
    return best ? { placement: best, isFavorite: bestIsFavorite } : null;
  }

  private nearestFood(c: Creature, radius: number): FoodItem | null {
    let nearest: FoodItem | null = null;
    let nearestDistSq = radius * radius;
    for (const f of this.foodItems) {
      const dx = f.x - c.x;
      const dy = f.y - c.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearest = f;
        nearestDistSq = distSq;
      }
    }
    return nearest;
  }

  /**
   * 一夫一妻：先幫還沒配對的個體找對象（resolvePairing），配對成功後就只跟那一位繁殖，
   * 直到其中一方退場才會恢復單身、可以再配對（見 performBreed 的退場處理）。
   * 沒有壽命機制：族群滿了不會停止繁殖，而是讓最年長的個體「退場」讓位給新生命，
   * 這樣族群會持續世代交替，不會卡在上限後就靜止不動。也沒有水量/光照門檻——
   * 配對跟繁殖純粹看接近度＋基因相容度，玩家不需要管理任何數值就能持續發生。
   */
  private resolveBreeding(dt: number): void {
    this.resolvePairing(dt);
    this.resolvePairedBreeding(dt);
  }

  /**
   * 還沒配對的個體，彼此夠近時依相容度擲骰決定要不要成為伴侶。配對當下重置冷卻，不會配對完馬上生。
   * 只有同輩分（genome.generation 相同，出生時就固定、終生不變）才能配對——輩分不同就跳過，
   * 繼續往下找其他候選，不會因為第一個剛好輩分不同就整輪放棄。
   */
  private resolvePairing(dt: number): void {
    const cfg = this.config;
    const n = this.creatures.length;
    for (let i = 0; i < n; i++) {
      const a = this.creatures[i];
      if (a.partnerId) continue;

      for (let j = i + 1; j < n; j++) {
        const b = this.creatures[j];
        if (b.partnerId) continue;
        if (b.genome.generation !== a.genome.generation) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy > cfg.matingRadius * cfg.matingRadius) continue;

        const compat = compatibility(a.genome, b.genome);
        const rate = cfg.baseBreedRatePerSecond * (0.25 + 0.75 * compat);
        const chance = 1 - Math.exp(-rate * dt);

        if (Math.random() < chance) {
          a.partnerId = b.id;
          b.partnerId = a.id;
          a.lastBredAt = this.time;
          b.lastBredAt = this.time;
        }
        break; // 每隻一輪只跟最近的候選擲一次骰，不論成敗都不繼續找下一位
      }
    }
  }

  /** 已配對的伴侶，冷卻過了、彼此還夠近，就依相容度擲骰生下一代。每隻只由 id 較小的一方處理，避免同一對算兩次。 */
  private resolvePairedBreeding(dt: number): void {
    const cfg = this.config;
    // 全域節奏：不管當下有幾對伴侶符合條件，離上一次新生命還沒過 birthEventCooldownSeconds
    // 就整批跳過，維持「大約一天一則消息」的步調，而不是背景一直有生物在生。
    if (this.time - this.lastBirthAt < cfg.birthEventCooldownSeconds) return;
    for (const a of this.creatures) {
      if (!a.partnerId || a.id > a.partnerId) continue;
      const b = this.creatures.find((c) => c.id === a.partnerId);
      if (!b) {
        a.partnerId = null; // 保底：理論上退場時會同步清掉伴侶關係，這裡防止殘留的無效 id
        continue;
      }
      if (this.time - a.lastBredAt < cfg.cooldownSeconds) continue;
      if (this.childrenCountOf(a.id, b.id) >= cfg.maxChildrenPerPair) continue; // 已達這對伴侶的生育上限，維持配對但不再生

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy > cfg.matingRadius * cfg.matingRadius) continue;

      const compat = compatibility(a.genome, b.genome);
      const rate = cfg.baseBreedRatePerSecond * (0.25 + 0.75 * compat);
      const chance = 1 - Math.exp(-rate * dt);

      if (Math.random() < chance) {
        this.performBreed(a, b);
        return; // 每次呼叫最多成立一次繁殖事件，避免同 tick 內連鎖
      }
    }
  }

  /** 這對伴侶（不論現在是否還在世）歷來已經生過幾隻——用圖鑑的歷史紀錄回推，不用額外存狀態。 */
  private childrenCountOf(aId: string, bId: string): number {
    let count = 0;
    for (const d of this.discoveredCreatures) {
      if (d.parentIds && d.parentIds.includes(aId) && d.parentIds.includes(bId)) count++;
    }
    return count;
  }

  /** 這對伴侶已經生過的子女，各自的「外形+顏色」簽章集合，供 performBreed 避免手足重複用。 */
  private siblingSignaturesOf(aId: string, bId: string): Set<string> {
    const sigs = new Set<string>();
    for (const d of this.discoveredCreatures) {
      if (d.parentIds && d.parentIds.includes(aId) && d.parentIds.includes(bId)) sigs.add(siblingSignature(d.genome));
    }
    return sigs;
  }

  private performBreed(a: Creature, b: Creature): void {
    a.lastBredAt = this.time;
    b.lastBredAt = this.time;

    // 手足外形/顏色不重複（可以跟父母一樣）：重新擲基因直到跟這對伴侶已生過的子女都不撞，
    // 設個上限次數保底，避免極端情況（色系+外形組合被佔滿）真的湊不出來時卡住無窮迴圈。
    const usedSignatures = this.siblingSignaturesOf(a.id, b.id);
    let childGenome = breed(a.genome, b.genome);
    for (let attempt = 0; attempt < 12 && usedSignatures.has(siblingSignature(childGenome)); attempt++) {
      childGenome = breed(a.genome, b.genome);
    }

    // 訪客血脈：任一親代「目前帶有沾染」或「本身基因已經有血脈標記」，子代就有機會繼承——
    // 沒有任何一方帶有痕跡的正常配對，這個 candidate 就是 null，永遠不會生出帶血脈的小孩。
    const lineageCandidate = a.taintedBy ?? b.taintedBy ?? a.genome.visitorLineage ?? b.genome.visitorLineage;
    if (lineageCandidate && Math.random() < VISITOR_LINEAGE_INHERIT_CHANCE) {
      childGenome.visitorLineage = lineageCandidate;
    }

    const childX = (a.x + b.x) / 2 + (Math.random() - 0.5) * 0.3;
    const childY = (a.y + b.y) / 2 + (Math.random() - 0.5) * 0.3;
    const child = createCreature(childGenome, childX, childY, this.time, [a.id, b.id]);

    let retired: Creature | undefined;
    if (this.creatures.length >= this.config.populationCap) {
      retired = this.pickElderToRetire(a, b);
      if (retired) {
        const idx = this.creatures.indexOf(retired);
        if (idx !== -1) this.creatures.splice(idx, 1);
        // 退場的一方如果有伴侶，伴侶要恢復單身才能再配對，不然會卡死在一個空的 partnerId 上。
        if (retired.partnerId) {
          const widow = this.creatures.find((c) => c.id === retired!.partnerId);
          if (widow) widow.partnerId = null;
        }
      }
    }

    this.creatures.push(child);
    this.observeGenome(child);
    this.totalBirths += 1;
    this.lastBirthAt = this.time;

    for (const listener of this.listeners) listener({ parentAId: a.id, parentBId: b.id, child, retired });
  }

  /** 挑最年長（bornAt 最早）的個體退場，剛繁殖的這兩隻不列入候選，避免「生完小孩自己就消失」的錯愕感。 */
  private pickElderToRetire(a: Creature, b: Creature): Creature | undefined {
    let elder: Creature | undefined;
    for (const c of this.creatures) {
      if (c === a || c === b) continue;
      if (!elder || c.bornAt < elder.bornAt) elder = c;
    }
    return elder ?? this.creatures[0];
  }
}
