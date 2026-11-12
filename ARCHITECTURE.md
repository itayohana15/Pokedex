# ארכיטקטורה

## מצב נוכחי מול יעד

**המצב בפועל (2026-11-11):** קיים workspace npm, לקוח React/Vite, API Express/Mongoose, סכמות MongoDB, endpoints, Sync ו-Collectr Import. `.env` מצביע ל-`mongodb://127.0.0.1:27017/Pokedex`. MongoDB מכיל 1,025 Pokémon, 672 Sets ו-45,620 Cards בשפות en/ja/zh-cn/zh-tw/ko. Audit חי אימת כיסוי לכל Set: 424 מלאים, 8 חלקיים ו-240 שבהם פרטי TCGdex מחזירים רשימת Cards ריקה למרות `cardCount.total` חיובי. כל IDs שכן הוחזרו על ידי TCGdex קיימים מקומית; ה-פערים הם במידע המקור עצמו, לא קלפים שהמערכת הוסיפה. סטטוסים, מספרי `official`/`total`, פערי מספרים ונתוני תמונות/rarity מוצגים ב-Settings.

**היעד:** אפליקציית Web מקומית מלאה למעקב אחר אוסף Pokémon Special Art Cards. בכל סעיף להלן מצוין אם מדובר במימוש קיים או בהמשך מתוכנן.

## מבנה קיים

```text
.
├── client/
│   ├── index.html
│   ├── package.json
│   └── src/ (App.tsx, api.ts, main.tsx, styles.css)
├── server/
│   ├── package.json
│   └── src/ (app.ts, config.ts, index.ts, models.ts, routes.ts, integrations.ts, collectr.ts, classification.ts)
├── package.json
├── package-lock.json
├── .env.example
└── README.md
```

מבנה ה-client/server המפורט בהמשך הוא יעד ארגוני; כרגע רוב קובצי המקור נמצאים ישירות תחת `src/`.

## מבנה הפרויקט המתוכנן

```text
pokemon-collection/
├── client/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       ├── utils/
│       └── styles/
├── server/
│   └── src/
│       ├── models/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── integrations/
│       ├── jobs/
│       ├── middleware/
│       ├── utils/
│       └── config/
├── package.json
├── .env.example
└── README.md
```

## טכנולוגיות וגבולות רכיבים

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, React Router 7, TanStack Query, Lucide React ו-Recharts.
- **Backend:** Node.js, Express, TypeScript ו-REST API.
- **Persistence:** MongoDB עם Mongoose. החיבור מתבצע דרך `MONGODB_URI`, כך שניתן להגדיר MongoDB מקומי או Atlas; MongoDB הוא מקור האמת.
- **כתובות פיתוח:** לקוח `http://localhost:5173`, שרת `http://localhost:5000`.
- **הרצה:** נדרשת פקודת `npm run dev` בשורש שתפעיל את הלקוח והשרת במקביל.
- **תצורה מתוכננת:** `MONGODB_URI`, `PORT=5000`, `CLIENT_URL=http://localhost:5173`. אין לשמור סודות בקוד או בתיעוד; `.env` אינו אמור להיכנס ל-Git.
- אין להשתמש ב-Next.js, SQLite או Prisma. אין להשתמש ב-localStorage כמסד נתונים ראשי.

## MongoDB ומודלים

המודלים מוגדרים ב-`server/src/models.ts`:

- **Pokemon:** מזהה, מספר National Pokédex, שם, תמונה/Artwork, סוג אחד או שניים, דור ונתונים רלוונטיים מ-PokeAPI.
- **Card:** מזהה מקור ייחודי בתוך שפה, שם/תמונה מקוריים, Set/Set ID, מספר קלף, category מקורי, `cardType`, rarity, סיווג, confidence/reason/source/reviewed, נתוני קשרי Pokémon, אמן, שפה ונתוני מקור. אינדקס נוסף מאפשר חיפוש לפי `{language, setId, localId}`.
- **PokemonCard:** קשר רבים-לרבים עם `verificationStatus`, `sourceField` ו-`reviewReason`. רק קשר מבוסס `dexId` מתועד ומאומת יכול להופיע בדפי Pokémon; `cameoDexIds` וקשרים legacy נשמרים ל-Review בלבד.
- **CollectionItem:** בעלות, כמות, שפה, Finish, מצב (Condition) ונתוני אוסף רלוונטיים. הדפסות בשפות או גימורים שונים יישארו נפרדות כשאלה גרסאות אספנות נפרדות.
- **Set:** פרטי סט, שפה ומזהה מקור; `cardCount.official`/`total` ורשימות TCGdex של Card IDs ומספרים, סטטוס הכיסוי והסיבה אם המקור ריק/חלקי.
- **ImportHistory:** היסטוריית ייבוא, תוצאות ונתונים הדרושים לביקורת ול-Rollback.
- **CardClassificationOverride:** החלטה ידנית על הכללה/הוצאה/קטגוריה, כולל `NEEDS_REVIEW` כשמשתמש משאיר קלף לא מוכרע; Sync בודק אותה לפני classifier.
- **CardReviewAction:** יומן append-only של Confirm / Not Special Art / Keep / Skip עם סיווג קודם/נוכחי, ראיות מקור snapshot, source ID/URL, actor, הערה וזמן החלטה.
- **UserSettings:** העדפות תצוגה ופילטרים; GET/PUT קיימים והעדפות נשמרות ב-MongoDB.
- **CollectrMatchOverride:** בחירה ידנית שמקושרת לזהות הרשומה ונשמרת ל-Re-preview.
- **SyncStatus:** מצב, שגיאה, זמני התחלה/סיום, ספירת התקדמות ו-lease למנעילת Sync; כולל Set פעיל.

קיימים אינדקסים ל-National Pokédex, זוגות PokemonCard וצירופי Card/Language/Finish/Condition באוסף. `Card` ו-`Set` משתמשים באינדקס unique מורכב `{language, sourceId}`. בעת עליית השרת מתבצעת הגירת אינדקסים לא-הרסנית; הגיבוי של `Pokedex` נוצר לפני ההגירה. Dashboard ו-Pokédex סופרים קלף ייחודי פעם אחת; Collection שומר גם את כמות העותקים. שדות הקטלוג והקשרים אינם ממוזגים בין הדפסות בשפות שונות.

## מקורות מידע, סנכרון וייבוא

### PokeAPI

מקור הנתונים: `https://pokeapi.co/api/v2`. מבנה רשימת Pokémon ופרטי Pokémon נבדק בפועל. ה-Sync הנוכחי מביא National Dex 1–1025, שם, תמונה, Artwork וסוגים. הדור נגזר מטווחי National Dex בקוד; יש לבדוק את ההנחה בבדיקות נתונים. ברירת המחדל לתצוגה היא מספר Pokédex בסדר עולה.

### TCGdex

ה-API מבוסס `https://api.tcgdex.net/v2/{language}/`. `/sets`, פרטי סט ופרטי קלף אומתו מול `en`, `ja`, `zh-cn`, `zh-tw`, `ko`, `fr`, `de`, `it`, `es`, `pt`, `id`, ו-`th`; הקודים הנתמכים הנוספים מפורטים ב-README וב-API. ה-Sync נפרד לכל שפה, כולל state/checkpoints לפי set ID, retries/upserts, שמות מקוריים, מזהי הדפסה ושדות מקור. אין קישור בין IDs של שפות שונות בהיעדר ראיה זהה; aliases של סטים נחשבים רק כאשר מזהה המקור זהה בדיוק. תמונות נשמרות כ-URL של TCGdex, ולא נוצרים מזהים/קלפים מלאכותיים. `cardCount.official` הוא מספר הקלפים הרשמי ו-`cardCount.total` כולל קלפים נוספים; הם נשמרים ברמת Set ואינם מחליפים זהות `localId`. Audit בודק רשימת Cards מפרטי Set ומשווה IDs ומספרים לקטלוג המקומי. כיסוי חסר מסומן `PARTIAL` או `MISSING_DATA` ומוצג ב-Settings; אין ליצור קלפים שלא הוחזרו במקור. פרטי מקור: [TCGdex sets](https://tcgdex.dev/rest/sets), [TCGdex set detail](https://tcgdex.dev/rest/set).

### סנכרון ושמירת נתונים

- MongoDB משמש Cache מתמשך ומקור נתוני המסכים; טעינת מסכים אינה פונה למקורות החיצוניים.
- Sync יזום מתחיל ברקע דרך `/api/sync`; מצב והתקדמות נשמרים ב-SyncStatus ונקראים ב-`/api/sync/status`.
- הנתונים נשמרים ב-upsert הדרגתי, כך שכשל במקור משאיר נתונים קודמים. זמן Sync אחרון מוצג ב-Settings.
- החלטות סיווג ידניות נשמרות ב-CardClassificationOverride ומיושמות בסנכרון הבא.
- TCGdex `category` הוא המקור ל-`cardType` (`POKEMON`, `TRAINER`, `ENERGY`, `OTHER`, `UNKNOWN`). רק Pokémon מסוג `POKEMON` ובקטגוריית Special Art יכולים להיכלל באוסף/סטטיסטיקות. סוג חסר או סותר עובר ל-`NEEDS_REVIEW`.
- קשרים מאומתים נוצרים מ-`dexId` בלבד. אין הרחבה דרך שרשרת אבולוציה, התאמת שמות או סט; `cameoDexIds` נשמר כמידע מקור ויוצר קשר Review בלבד, משום שמשמעותו לא אומתה בתיעוד המקור.
- תמונות נטענות מכתובות המקור עם `loading="lazy"`; לא מורידים אותן מראש.
- Sync TCGdex שומר checkpoints לפי שפה וסט, מבצע retries ו-upserts, וכולל MongoDB lease/heartbeat למניעת Sync מקביל בין תהליכים. ניתן להפעיל Sync ל-Set אחד ולראות את ה-Set הנוכחי והתקדמותו. הספירות שנשמרו: en 221/23,912, ja 202/13,156, zh-cn 56/877, zh-tw 98/7,436, ko 95/239 (Sets/Cards). Audit חי סיווג לפי שפה: en 215 מלאים/2 חלקיים/4 ללא Cards; ja 119/2/81; zh-cn 8/0/48; zh-tw 80/3/15; ko 2/1/92. IDs כפולים ברשימת Sets של TCGdex: BW3a ו-BW8a ב-ja, CSV1C ב-zh-cn. בכל שפה נשמרת זהות נפרדת תחת unique `(language, sourceId)`.

### סיווג קלפים

שירות הסיווג נמצא ב-`server/src/classification.ts`. הוא קובע תחילה את סוג הקלף לפי category המקורי, מסנן Trainer/Energy, ואז משתמש בתוויות Special Art מפורשות. URL תמונה אינו ראיה לסיווג, כי אין מנגנון אימות אמין שמוכיח שהתמונה תקינה או מיוחדת. IR/AR ו-Character Rare ממופים ל-`ILLUSTRATION_RARE`; SIR/SAR ו-Character Super Rare ל-`SPECIAL_ILLUSTRATION_RARE`. `ALTERNATE_ART`, `FULL_ART` ו-`SPECIAL_ART_PROMO` נתמכים ב-override ידני או כאשר יש ראיית מקור מפורשת. Full Art ו-Promo כלליים נשארים `NEEDS_REVIEW`; אין סיווג לפי rarity בלבד. כל תוצאה שומרת confidence, reason, source ו-review status; override ידני גובר על סיווג אוטומטי ונשמר בסנכרון.

אין בנתוני TCGdex המקומיים שדה artwork ייעודי שמבדיל Alternate Art/Full Art עבור רוב ההדפסות הוותיקות. אין ניתוח חזותי אוטומטי; קלפים עמומים נשארים לבדיקה ידנית ולא מסווגים לפי שם או מספר בלבד.

### Visual Promo Gallery

ה-Gallery הוא כלי Review חזותי עבור Pokémon Promo בשפות `en`, `ja`, `zh-cn`, `zh-tw`. הוא קורא את קבוצת ה-Promo שנמצאת ב-`NEEDS_REVIEW` או שיש לה היסטוריית `CardReviewAction`, כדי שאפשר יהיה לתקן החלטה שכבר נשמרה. Trainer/Energy ושפות אחרות מוחרגים. `GET /classification/review/visual/summary` מחזיר ספירות progress ואפשרויות filter; `GET /classification/review/visual` מחזיר עד 100 Cards לעמוד עם סינון שפה/Set/Pokémon/rarity/image/review status/decision ומיון Set/מספר/Pokémon/שפה/שם. ה-Frontend שומר התקדמות אחרונה ב-localStorage, טוען תמונות עם `loading=lazy`, ומאפשר Zoom, ניווט, שני קלפים להשוואה ובדיקת Set ברצף.

Confirm מחייב בחירת קטגוריית artwork מהקטגוריות הקיימות; Reject ו-Keep Undecided דורשים לחיצה מפורשת. ב-Gallery, Keep כותב override `NEEDS_REVIEW` כדי שסנכרון עתידי לא יחליף החלטה זו, ושאר הפעולות מעדכנות override קיים רק לאחר פעולה מפורשת. כל תיקון מוסיף `CardReviewAction` חדש ואינו מוחק היסטוריה. אין פעולת Bulk. תמונות חלופיות מוגדרות במיפוי בדוק עם source ID, URL תמונה/מקור, checked date, confidence ושדות זהות תואמים. התאמה דורשת שם, שפה, Set ID ומספר, וכן artist כאשר נשמר; URL התמונה נשאר חיצוני ומיוחס ולא נכתב ל-`Card.image`.

בדיקת חלופות מ-2026-11-12 מצאה 4/494 קישורים מדויקים: מקור Pokémon Japan רשמי אחד (`SV-P 200`, שם ואמן מאומתים), ושלושה scans שמסופקים על ידי TCGPromos עבור MEP 003, MEP 009 ו-MEP 094; האחרונים מסומנים Community. [PTCG Image Atlas](https://nstrelow.github.io/ptcg-image-atlas/) ו-[data.json שלו](https://github.com/nstrelow/ptcg-image-atlas/blob/main/data.json) שימשו לאיתור מקורות, אך האתר עצמו מתאר את הנתונים כרמזים לאימות ולא כ-reference hand-verified. לא נמצאה התאמה מדויקת ל-490 האחרים בסבב המוגבל; חיפוש נוסף נותר פתוח. לא שונו סיווגים או תמונות ב-Pokedex.

`npm run refresh:card-classification` מבצע Dry Run כברירת מחדל ומחיל שינויים רק עם `--apply --backup <archive>` אחרי אימות גיבוי ו-hash של האוסף. בעדכון 2026-11-11 עודכנו 1,475 שדות סיווג מתוך מקור מפורש; 45,620 Cards נשמרו, מהם 37,707 Pokémon, 6,807 Trainer ו-1,106 Energy. המצב: 1,071 `ILLUSTRATION_RARE`, 389 `SPECIAL_ILLUSTRATION_RARE`, 6 `BLACK_WHITE_RARE`, 9 `AMAZING_RARE`, 34 `GALLERY_ART`, 9 `V_SPECIAL_ART`, 14 `VSTAR_SPECIAL_ART`, 3 `VMAX_SPECIAL_ART`, 31,712 `EXCLUDED` ו-12,373 `NEEDS_REVIEW`. סך הקלפים המאושרים Special Art הוא 1,535. Dry Run לאחר היישום דיווח 0 עדכונים; אין זיהוי מאומת חדש של Alternate Art/Full Art מתוך metadata המקומי, וקלפים עמומים נשארים לבדיקה.

ב-Dry Run נמצאו 43 Trainer cards שסווגו בעבר כ-Special Art עם 105 קשרים לדפי Pokémon, ו-2,092 קשרים שאינם עומדים בכללי המקור. המיגרציה עדכנה סטטוס אימות של 36,722 קשרים בלי למחוק או ליצור קשרים. גיבוי MongoDB אושר ב-`mongorestore --dryRun`. CollectionItems נשארו ללא שינוי: רשומה אחת; SHA-256 לפני ואחרי `bb46bc35a040afa653e79534132787c68e3df38c976a8072665af69f883d2f6a`. אין manual classification overrides.

עד השלמת המיגרציה, מסלולי ה-API משתמשים בבדיקת source category ו-`dexId` לרשומות legacy; אחרי המיגרציה הם מסתמכים גם על שדות הסוג וסטטוס האימות.

### Collectr Import

הייבוא מתבסס על טקסט שהמשתמש מעתיק מממשק Collectr; אין שימוש ב-API פרטי או ביצוא PRO. `parseCollectrText` מזהה גבולות רשומות לפי `Qty`, מסנן כותרות ממשק מוכרות, שומר את הטקסט המקורי לכל רשומה ומפענח שפה, סט, מספר, rarity, condition, finish, כמות ומחיר. שפה נלקחת מסימונים בשם או בפרטי הרשומה: ברירת המחדל היא `en`,‏ JP/JPN/Japanese הם `ja`,‏ CN/SC הם `zh-cn`,‏ TW/TC הם `zh-tw`, ו-KR/KOR/Korean הם `ko`. סימונים סותרים או `Chinese` כללי נשארים Needs Review. Condition, Finish ומחיר נשמרים אך אינם חלק מזהות ההדפסה.

`POST /api/collectr/preview` משתמש בנתוני TCGdex שסונכרנו ונשמרו ב-MongoDB: `Set.sourceId`, שמות Sets לפי שפה ו-`cardCount` מגיעים מפרטי Set; Cards נשמרים מתוך `detail.cards` ופרטי הקלפים. פרטי המקור מתועדים ב-[TCGdex sets](https://tcgdex.dev/rest/sets) וב-[TCGdex set detail](https://tcgdex.dev/rest/set). Set נפתר לפי שם מדויק בשפה המבוקשת, או לפי שם בשפה אחרת רק כאשר אותו TCGdex `sourceId` קיים בשפת ההדפסה. לאחר מכן החיפוש מגביל ל-Set ID ול-`localId`; אפסים מובילים מנורמלים רק לצורך ההשוואה. התאמה אוטומטית דורשת גם שם קלף ונדירות תואמים ושפה מדויקת.

`cardCount.official` ו-`cardCount.total` מאמתים מספור: קלף מעבר ל-`official` אך עד `total` נבדק כמועמד; המספר לבדו לא יוצר התאמה. מספר+סט עם שם/נדירות שונים מוצג ב-Needs Review. לכל רשומה נכתב לוג של Set, ספירות, `localId`, קלפים שנמצאו ותוצאת בדיקות הזהות. תמונות מועמדים מגיעות משדה `image` של TCGdex; מצב חסר מוצג רק כשאין URL תקין.

`GET /api/collectr/cards/search?q=...&language=...` מסנן לשפת הרשומה; אם לא נמסרה שפה, משתמש ב-`en`. עבור סימוני שפה סותרים הוא מחפש רק בין השפות שהופיעו בסימונים, והבחירה נשארת ידנית. התוצאות הלא-כשירות מוצגות עם סיבת חסימה אך אינן ניתנות לבחירה/ייבוא. ה-UI מציג מועמדים עם תמונה או מצב מקור חסר, שם, סט, מספר, נדירות, שפה וסיבת הצעה. החלטות Review נרשמות ב-ImportHistory; בחירות ידניות כשירות נשמרות גם ב-`CollectrMatchOverride` כדי לשרוד Re-preview. היסטוריית Preview ניתנת לפתיחה לקריאה בלבד וניתן להריץ ממנה Preview חדש ללא שינוי הרשומה הישנה. Commit דורש בחירה מפורשת ושומר snapshot קודם; רשומות שלא נבחרו אינן מוכנסות או נמחקות. `POST /api/collectr/:importId/rollback` משחזר מצב קודם לאחר אישור בממשק. כתיבה נעשית עם rollback מפצה אם פעולת commit נכשלת; אין טרנזקציית MongoDB, ולכן עדיין דרושות בדיקות כשל מקיפות.

המשתמש בדק בפועל את Export בחשבונו ודיווח שנדרש PRO/שדרוג. הדבר תואם לעמוד הציבורי [PRO](https://getcollectr.com/pro), שמציג Seamless Export כתכונת PRO. הייבוא נשאר עצמאי מ-Export.

בדיקת MongoDB ו-API מקומי אישרה ש-White Flare (`sv10.5w`) מכיל 173/173 קלפים. `sv10.5w-091` נשמר כ-Deerling, `localId=091`, `Illustration rare`, עם תמונה אמיתית וסיווג `ILLUSTRATION_RARE`. בשילוב `cardCount.official=86`, המספר הוא `091/086`; ה-UI מציג כרגע את `091` בלבד. קשרי MongoDB מחברים אותו ל-Deerling #585 ול-Sawsbuck #586; הקלף מופיע בחיפוש ובמסך פרטי Pokémon.

## REST API

ה-API ממומש ב-`server/src/routes.ts`, תחת prefix `/api`:

- `GET /health` — מצב השרת וחיבור MongoDB.
- `GET /pokemon` — רשימה עם `search`, `generation`, `type` ו-`status`; התגובה כוללת ספירה והתקדמות.
- `GET /pokemon/:nationalDex` — Pokémon וקלפי Special Art מקושרים.
- `GET /collection`, `PUT /collection/:cardId` — רשימת אוסף ועדכון כמות; רשומות כוללות קישורי Pokémon עבור סינון מקומי.
- `GET /cards/missing`, `GET /stats` — קלפים חסרים, מדדים ו-breakdowns לפי דור, Type, קטגוריית artwork וסט.
- `GET /classification/review/summary` — ספירות Review ואפשרויות filter.
- `GET /classification/review` — Review queue מדופדף ומסונן; `POST /classification/review/:cardId/action` — החלטת משתמש מפורשת ויומן evidence.
- `GET /classification/review/visual/summary`, `GET /classification/review/visual` — ספירות וקבוצת Promo Review חזותית, כולל החלטות קודמות ו-pagination.
- `POST /classification/review/:cardId/action` עם `reviewScope=promo-visual-gallery` — Confirm / Reject / Keep Undecided של Promo, שמירת actor/evidence והיסטוריה; תמונת source חיצונית נשמרת רק בתוך evidence של הפעולה, לא ב-Card.
- `PUT /classification/:cardId` — endpoint סיווג ידני קודם, נשמר לתאימות ומתעד גם CardReviewAction.
- `POST /sync`, `POST /sync/tcgdex/:language`, `POST /sync/tcgdex/:language/sets/:setId`, `GET /sync/status`, `GET /settings`, `GET /settings/catalog-coverage` — Sync מלא/לשפה/ל-Set יחיד ודוח כיסוי מקור.
- `POST /collectr/preview`, `POST /collectr/:importId/commit`, `POST /collectr/:importId/rollback`, `GET /collectr/history`, `GET /collectr/history/:importId`, `PUT /collectr/:importId/records/:recordIndex/decision` — Preview, Review והיסטוריית Collectr.
- `GET/PUT /settings/preferences` — שמירת פילטרים ב-UserSettings.
- `GET /settings/catalog-coverage` — דוח כיסוי TCGdex לפי שפה ו-Set, כולל ספירות ותקלות מקור.
- `GET /filters/options` — טעינת רשימות Pokémon, Sets, languages וקטגוריות מתוך כל מאגר MongoDB.
- `GET /collectr/cards/search` — חיפוש cards לבחירה ידנית מתוך Preview.

Pagination וסינון שרת קיימים בתור Review בלבד; רשימות Collection/Missing עדיין מסוננות בצד לקוח. גיבוי/שחזור מתוך Settings, חוזים משותפים מקצה לקצה ואימות משתמשים עדיין לא קיימים.

## Smart Special Art Review

ה-Review queue טוען רק `NEEDS_REVIEW`, מחשב סיבות/שלמות metadata מתוך שדות Card ו-`sourceData`, ומחזיר דפים של עד 100 קלפים. אפשר לסנן לפי language, Set ID ושפת Set, rarity, category, Pokémon `dexId`, קבוצת סיבה, image URL, state ו-search. המיון מציע מספר שדות ראיות, classifier confidence ו-metadata completeness. ערכי `SKIP` מוסתרים מהתור הפעיל אך ניתן להציגם.

קבוצות סיבה עשויות לחפוף. `source_insufficient` חלה על כל הקלפים שלא הוכחו כסיווג artwork; `image_missing` בודקת URL ולא מבטיחה שנכס נטען; `special_promo_possible` אינה אישור Special Art. ב-2026-11-11 נסרקו 12,373 רשומות: 6,010 rarity חסר, 5,022 עמום, 1,341 Promo אפשרי, 6,432 עם URL תמונה, 6,363 עם metadata מלא, ו-0 תוויות מקור מפורשות Alternate/Full Art. כל הסיווגים נשארו ללא שינוי.

TCGdex fields נלקחים מרשומת source data הספציפית (`/{language}/cards/{sourceId}`) ונשמרים לכל שדה כ-evidence עם זמן sync/זמן מקור ו-confidence מסוג `direct-source-field`. TCGdex מספק שדות זהות/rarity/קטגוריה/תמונה אך אינו מוכיח כשלעצמו ש-card הוא Special Art; `classificationConfidence` מוצג בנפרד. תיעוד: [TCGdex Card reference](https://tcgdex.dev/reference/card). המאגר הרשמי של Pokémon TCG יכול לסייע לבדיקה ידנית לפי זהות/תמונה, אך ללא crosswalk מאומת ל-TCGdex אינו מוזן למנוע החלטה. ה-Pokémon TCG API מסומן deprecated ולא משולב.

רק פעולה מפורשת משנה classification: Confirm דורש בחירת קטגוריית Special Art וראיית מקור לקטגוריית Pokémon; Mark Not Special Art שומר EXCLUDED. בתור הישן Keep/Skip רק נרשמים; ב-Visual Gallery Keep מעדכן במפורש את classification ל-`NEEDS_REVIEW` ושומר override באותו ערך. כל פעולה והחלטה חוזרת נרשמות append-only ב-`CardReviewAction`; אין endpoint או UI ל-Bulk Approve. מסך Review לא נוגע ב-CollectionItem או ב-PokemonCard.

## מסכים והתנהגות מוצר

- **ממומש חלקית:** Pokédex עם Grid/List, חיפוש, מסנני Type/Generation/Status ומיון; פרטי Pokémon, אוסף, חסרים, Dashboard ו-Settings. Settings כולל Evidence Queue ו-Visual Promo Gallery עם Grid ותמונות lazy, Small/Medium/Large, Zoom, prev/next, השוואת שני קלפים, רצף Set, סינון, progress, קיצורי A/D/S/חצים/Z והחלטות ידניות.
- **ממומש חלקית:** Collectr Import עם Preview, שלוש לשוניות Review, תמונות מועמדים, חיפוש ידני, שמירת החלטות, history/re-preview ו-Rollback מאושר.
- **ממומש חלקית:** מסנני Collection/Missing לפי Pokémon/generation/type/set/language/category/search, אפשרויות מתוך המאגר המלא, ומיון לפי שם, מספר קלף, Pokédex, התקדמות, כמות קלפים וסט; גרפים מבוססי DB לפי Generation/Type/Category/Set.
- **פתוח:** גיבוי/ייצוא מתוך UI, pagination לרשימות כלליות, בדיקת UI גרפית מלאה (Chrome המקומי נכשל בגלל סביבת Snap/`GLIBCXX_3.4.29`), חיפוש תמונות נוסף ל-490 ה-Promo שלא הותאמו, ותמיכה ב-set aliases שאין להם מזהה מקור משותף מוכח. ביקורת artwork ידנית ל-12,373 קלפים עדיין פתוחה.

## החלטות טכניות ושאלות פתוחות

- הסטאק מממש את הבחירה שנדרשה: React/Vite, Express ו-MongoDB/Mongoose.
- `.env.example` מכיל משתנים נדרשים; `server/src/config.ts` טוען `.env` משורש הפרויקט. אין סודות ב-repository.
- אין נתוני דוגמה קשיחים. Preview מ-2026-11-11 מתוך originalText באורך 85,921 החזיר 744 רשומות: 243 Matched,‏ 124 Needs Review,‏ 377 Unmatched ו-2 שורות מסוננות. תיקון parser חילץ 31 תוויות rarity נוספות; בשתי רשומות המקור לא ציין rarity. ביקורת עצמאית של 239 התאמות אוטומטיות מצאה 0 אי-התאמות לפי שפה, Set, מספר, שם, rarity מפורשת וקטגוריית Pokémon; 4 החלטות ידניות נשמרו. CollectionItems נשארו ללא שינוי (פריט אחד, SHA-256 `bb46bc35a040afa653e79534132787c68e3df38c976a8072665af69f883d2f6a`). לא בוצע Commit.
- ב-Preview הנוכחי Thievul/Abyss Eye, Cubone/Gem Pack Vol. 3 ו-Mew ex/Collect 151 Surprise נשארו Unmatched, משום ששמות אלה אינם נמצאים בקטלוג או ברשימות `/sets` שנבדקו ל-en/zh-cn; לא נוצרו aliases. TCGdex לא מחזיר URL תמונה ל-Bibarel אחד ב-Needs Review; הממשק מסמן מקור תמונה חסר.
- סנכרוני ja/zh-cn/zh-tw/ko עבדו, אך נתוני TCGdex עצמם חסרים בחלק ניכר מהסטים; שמות Collectr באנגלית לסטים זרים לא נחשבים alias בלי ראיה. יש להמשיך לפי source warnings ולבנות mappings מאומתים בלבד.
- התיקייה אינה מאגר Git. `npm run build` עבר, `npm test` עבר עם 91 בדיקות ב-6 קבצים, ו-`npm audit --audit-level=high` מצא 0 vulnerabilities. `npm` מדווח אזהרת תאימות עם Node 20.10.0, אך פקודות build/test עברו. עדכון סיווג הוחל אחרי גיבוי מאומת ו-Dry Run חוזר דיווח 0 עדכונים.

## שפות מותרות לתצוגה

רשימת השפות לתצוגת קלפים ולייבוא היא `en`, `ja`, `zh-cn`, `zh-tw`. `POKEMON_SPECIAL_CARD_FILTER` מוסיף `$in` על הרשימה, ו-Review snapshot, `GET /settings`, סיכומי שפה, כיסוי קטלוג והתקדמות Sync מסוננים באותה רשימה. הדבר חל גם על Pokédex, Pokémon Details, Collection, Missing ו-Dashboard, מאחר שהמסכים משתמשים ב-API המסונן. ה-Frontend מסנן בנוסף את אפשרויות השפה ב-Dropdowns.

Allowlist התצוגה נפרד מ-`TCGDEX_LANGUAGES` של מנגנון ה-ingestion. אין מחיקה או מיגרציה לנתוני `ko`/שפות אחרות; Sync אינו מופעל כדי להסתיר נתונים. CollectionItems קיימים בשפות שאינן מאושרות נשארים במסד, אך לא מוחזרים בממשקי התצוגה. PUT לעדכון Collection ופעולות Review/Collectr דוחות הדפסה בשפה מוסתרת.

העדפות פילטר ישנות שמכילות שפה מוסתרת מוחזרות ל-UI עם ערך שפה ריק; מסמך `UserSettings` המקורי נשאר ללא שינוי. עדכון העדפות דרך ה-API שומר רק שפה מאושרת או ערך ריק.

Collectr Preview מסמן שפה לא מאושרת כ-`unmatched`, עם סיבת `Unsupported language` וללא מועמדים. חיפוש ידני בשפה כזו מחזיר מערך ריק, והחלטה/Commit נדחים בשרת. Original text והיסטוריית Import נשמרים. סימוני `en`/`ja`/`zh-cn`/`zh-tw` ממשיכים להשתמש בכללי ההתאמה הקיימים.

בקריאת Collection וסטטיסטיקות, פריט נחשב שייך להדפסה רק כאשר `CollectionItem.language` זהה ל-`Card.language`. סינון זה נעשה בזמן קריאה בלבד ואינו משנה רשומות קיימות.

## תוצאת Promo Art dry run — 2026-11-11

נותחו 1,341 מועמדי Promo מ-`NEEDS_REVIEW` בנתוני TCGdex השמורים; כל הרשומות מסווגות Pokémon ו-`rarity=Promo`. לכל הרשומות קיימים sourceId, שם, Set ID/שם, localId, שפה, קטגוריה ו-source URL. 847 תמונות זמינות ב-TCGdex נמשכו ונבדקו; ל-494 אין URL תמונה. השפות: en 1,081, ja 213, zh-tw 47. כל הרשומות נשארו `NEEDS_REVIEW`: לא התווסף סיווג למסד. שדה TCGdex אינו מתייג artwork כ-Full Art או Alternate Art; מאחר שלא אומת crosswalk נוסף לכל sourceId, עצם ה-Promo או התמונה אינם אישור/דחייה. פירוט הקבוצות, הראיות והגבולות נמצא ב-`SPECIAL_ART_REVIEW_REPORT.md`.

בבדיקה הסופית לשינוי זה עברו `npm test` עם 101 בדיקות ב-7 קבצים, `npm run build` ו-`npm audit --audit-level=high` עם 0 vulnerabilities. npm 11.12 מציג אזהרת תאימות מול Node 20.10.0, אך שלוש הבדיקות הנדרשות עברו.
