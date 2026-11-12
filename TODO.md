# TODO

הסימונים משקפים את המימוש שנבדק בפועל. `[x]` מציין פעולה שהושלמה ונבדקה; `[ ]` מציין עבודה פתוחה. האפליקציה עדיין אינה ממלאת את כל הדרישות.

## Visual Special Art Review — 2026-11-12

- [x] להוסיף Visual Gallery paginated עם טעינת תמונות lazy, שלושה גדלים, פרטי הדפסה וסטטוס החלטה.
- [x] להוסיף Zoom, ניווט בין קלפים עם מקלדת/כפתורים, השוואת שני קלפים גם בין עמודים, ורצף Set לפי מספר קלף.
- [x] לסנן לפי ארבע השפות המאושרות, Set, Pokémon, rarity, תמונה, Review status והחלטה; למיין לפי Set/מספר/Pokémon/שפה/שם.
- [x] להוסיף Confirm / Not Special Art / Keep Undecided ללא בחירת החלטה מראש; Confirm דורש בחירת קטגוריית artwork קיימת. A/D/S, חצים ו-Z נתמכים.
- [x] לשמור התקדמות/פילטר/קלף אחרון ב-localStorage ולהציג מד התקדמות וספירות החלטה.
- [x] לשמור כל פעולה מפורשת ב-`CardReviewAction` ו-`CardClassificationOverride`, עם actor, זמן, מקור והערה; תיקון החלטה משאיר את הפעולות הקודמות בהיסטוריה. Keep Undecided כותב override `NEEDS_REVIEW` מפורש שנשמר גם ב-Sync.
- [x] להגביל את Gallery ל-Pokémon Promo בשפות `en`, `ja`, `zh-cn`, `zh-tw`; ה-API אינו מחזיר `ko` או קלפי Trainer/Energy.
- [x] ליצור ולבדוק גיבוי לפני שינוי enum ב-override: `/tmp/pokedex-before-visual-special-review-2026-11-12.archive.gz`; `mongorestore --dryRun` עבר.
- [x] לבצע GET חי לקריאה בלבד: 1,341 מועמדים, 847 עם תמונת TCGdex, 494 ללא URL, 0 החלטות; לא נכתבו Cards/Images/Overrides/CollectionItems.
- [x] לבדוק זהויות מקור חלופי ולחבר 4 תמונות חיצוניות מאומתות (1 רשמי JP, 3 Community EN) עם ייחוס/URL/checkedAt/confidence. התמונות מוצגות מן המקור ולא נשמרות במסד.
- [x] בדיקות: API pagination/filter/language/image, שמירת החלטה ו-override, תיקון החלטה עם היסטוריה, החלטה בקלף חסר תמונת TCGdex, שמירת CollectionItems/PokemonCard, קיצורי מקלדת וחסימת התאמת תמונה כשזהות אינה מלאה. `npm test` 106/106; `npm run build` עבר; `npm audit --audit-level=high` מצא 0 vulnerabilities.
- [ ] להשלים בדיקה גרפית אינטראקטיבית בדפדפן. Chrome המקומי לא נפתח בגלל סביבת Snap/`GLIBCXX_3.4.29`; בוצע HTTP/API smoke בלבד.
- [ ] להמשיך חיפוש מקור חלופי עבור 490 הרשומות שלא קיבלו התאמת תמונה מאומתת בסבב זה.
- [ ] המשתמש יבדוק artwork ויקבל החלטות ידניות; כרגע כל 1,341 הקלפים נשארים Undecided.

## Smart Special Art Review — 2026-11-11

- [x] לנתח בקריאה בלבד את כל 12,373 הקלפים ב-`NEEDS_REVIEW`; לא שונו סיווגי Cards ולא נכתבו החלטות Review.
- [x] לספור סיבות Review: ראשי — 6,010 rarity חסר, 5,022 rarity עמום, 1,341 Promo אפשרי; חופפים — 6,010 metadata חסר, 5,941 URL תמונה חסר, ו-12,373 מקור לא מוכיח זכאות artwork. אין תוויות מקור מפורשות Alternate Art או Full Art.
- [x] לתעד תמונת מצב: 6,432 Cards עם URL תמונה; 6,363 עם 8/8 שדות metadata; 6,010 חסרים metadata. URL קיים אינו אימות שהתמונה נטענת או הוכחת סיווג.
- [x] להציג מקור TCGdex, source ID/URL, זמן sync/עדכון מקור וראיות לפי שדה. שדות המקור אינם מוכיחים Special Art כשלעצמם; הסיווג נותר להחלטת משתמש מפורשת.
- [x] להוסיף תור Review מדופדף ב-Settings עם סינון שפה, Set, rarity, category, Pokémon, reason ותמונה; מיון לפי ראיות, classifier confidence או completeness.
- [x] להוסיף פעולות ידניות Confirm / Not Special Art / Keep / Skip. Confirm מחייב בחירת סיווג וראיית קטגוריית Pokémon ממקור; כל פעולה נרשמת ב-`CardReviewAction`; שינוי סיווג יוצר `CardClassificationOverride`.
- [x] לאמת בבדיקות שה-GET אינו משנה סיווג, ש-CollectionItems וקשרי Pokémon אינם משתנים, ושהחלטות ידניות נשמרות. לא נחשפה פעולת Bulk.
- [x] ליצור גיבוי Pokedex לפני הוספת מודל/אינדקס Review ולבדוק את קובץ ה-archive עם `mongorestore --dryRun`.
- [ ] לבדוק ידנית artwork בפועל עבור 12,373 הקלפים; 5,941 חסרים URL תמונה ו-TCGdex אינו מספק תווית Alternate/Full Art למועמדים האלה.
- [ ] לאשר או לדחות קלפים. אין להציג את הקטלוג כשלם כל עוד אלה לא נבדקו.

## Promo art dry run ושפות לתצוגה — 2026-11-11

- [x] לנתח את כל 1,341 מועמדי ה-Promo מתוך `NEEDS_REVIEW` לפי מקור, שפה, סט, מספר, נדירות, סוג קלף ותמונה. 847 תמונות TCGdex זמינות נמשכו ונבדקו; ל-494 אין URL תמונה.
- [x] להציג תוצאת Dry Run בלי לשנות סיווגים: 0 Promo Special Art מאומתים, 0 Promo רגילים שניתן לדחות בוודאות, ו-1,341 נשארו לבדיקה. ל-TCGdex אין תווית Alternate/Full Art; לא נמצא crosswalk מאומת נוסף לכל הדפסה. `Promo` או URL תמונה לבדם אינם ראיה.
- [x] להגביל תוצאות API ותצוגת קלפים לשפות `en`, `ja`, `zh-cn`, `zh-tw`, כולל Pokédex, פרטים, Collection, Missing, סטטיסטיקות, Settings, Review ו-Collectr. נתוני שפות אחרות לא נמחקים ולא מסונכרנים מחדש.
- [x] לחסום בחירה/ייבוא ב-Collectr לשפה לא נתמכת ולהציג אותה כ-Unmatched עם סיבה מפורשת; לחסום גם חיפוש ידני, החלטה ו-Commit ב-API.
- [x] להוסיף בדיקות לכך ש-ko ושפות אחרות אינן בתוצאות API, אך Cards, Sets, קשרי Pokémon ו-CollectionItems נשארים ב-MongoDB.
- [x] לנקות שפה מוסתרת מתצוגת העדפות פילטר בלי לשנות את ערך `UserSettings` שכבר נשמר במסד.
- [x] אימות סופי: `npm test` עבר עם 101 בדיקות ב-7 קבצים; `npm run build` עבר; `npm audit --audit-level=high` מצא 0 vulnerabilities.
- [ ] לאחר אישור מפורש, להחיל רק החלטות Promo שהמשתמש אישר; אין לבצע Bulk Approval.
- [ ] לקבל מקור אמין עם crosswalk לפי TCGdex sourceId או לבדוק ידנית/לאמת כל artwork לפני הכרעה ב-1,341 מועמדי Promo.

## Frontend

- [x] לאתחל React + Vite + TypeScript ולקוח REST עם טיפוסים.
- [x] להגדיר React Router, TanStack Query, Tailwind, Lucide React ו-Recharts.
- [x] ליצור מסכים ראשוניים ל-Pokédex, Dashboard, פרטי Pokémon, אוסף, חסרים, Collectr Import ו-Settings.
- [x] להוסיף Grid/List, חיפוש, סינון Pokémon לפי Type/Generation/Status ומיון בסיסי.
- [x] להוסיף מצבי טעינה, שגיאה, נתונים ריקים, Owned/Missing ופעולות כמות בסיסיות.
- [x] להוסיף סינון ב-My Collection וב-Missing Cards לפי Pokémon, דור, Type, סט, שפה וקטגוריית קלף; רשימות האפשרויות נטענות מכל מאגר MongoDB והעדפות נשמרות ב-UserSettings.
- [x] להוסיף ממשק Import History עם פתיחת Preview שמור לקריאה בלבד, Re-preview לטקסט המקורי ו-Rollback עם אישור.
- [ ] להוסיף ייצוא, גיבוי ושחזור דרך Settings.
- [x] להציג Dashboard breakdowns מבוססי MongoDB לפי Generation, Type, קטגוריית artwork וסט.
- [x] לשמור העדפות סינון של My Collection ו-Missing ב-UserSettings; לממש מיון לפי שם, מספר קלף, מספר Pokédex, התקדמות, כמות קלפים וסט.
- [ ] להוסיף בדיקות React/זרימות משתמש ולטפל בנגישות מקלדת ובמסכים צרים באופן מלא.

## Backend

- [x] לאתחל Express + TypeScript, חיבור CORS, פרסור JSON וטיפול בשגיאות.
- [x] להוסיף `/api/health`, API לקריאת Pokédex/פרטים/אוסף/חסרים/סטטיסטיקות ופעולת עדכון כמות.
- [x] להוסיף endpoints ל-Sync, מצב Sync, קלפים לבדיקה ו-overrides לסיווג.
- [x] להוסיף endpoints ל-Collectr Preview/Commit/Rollback והיסטוריית ייבואים.
- [x] להוסיף endpoints לפתיחת ImportHistory, שמירת החלטות Review כטיוטה, הגדרות UserSettings והצגת התקדמות/ספירות לפי שפה.
- [x] להוסיף pagination, סינון ומגבלת 100 לרשומת Review; [ ] pagination ומגבלות מתאימות לרשימות API גדולות אחרות.
- [x] להוסיף checkpoints ל-TCGdex לפי Set, מצב התקדמות, retry נפרד ל-TCGdex והתאוששות מהפסקת שרת.
- [x] לוודא שסנכרון TCGdex באנגלית הסתיים: 221 מזהי סט ו-23,912 Cards נשמרו. ספירת `cardCount.total` של ה-API היא 24,140, לכן אין לטעון שכל הקלפים שמופיעים בסכומי המקור נשמרו.
- [x] למנוע Sync מקביל גם כאשר קיימים כמה תהליכי API/שרת באמצעות MongoDB lock עם lease ו-heartbeat.
- [ ] להוסיף אימות והרשאות אם יוגדרו דרישות למשתמשים מרובים.

## Database

- [x] להגדיר חיבור Mongoose ל-`mongodb://127.0.0.1:27017/Pokedex`, לאמת את שם ה-DB אחרי חיבור, ולהגדיר שמות collections מפורשים.
- [x] להגדיר מודלים: Pokemon, Card, PokemonCard, CollectionItem, Set, ImportHistory, CardClassificationOverride, CardReviewAction, UserSettings ו-SyncStatus.
- [x] להגדיר אינדקסים ל-ID מקור, National Pokédex, קשרים וייחודיות פריטי אוסף.
- [x] לשמור overrides ידניים כדי שיישמרו בסנכרון הבא.
- [x] להוסיף ל-Card סוג קלף, ראיות/ביטחון לסיווג וסטטוס קשרים; לשמור את קטגוריית TCGdex ואת שדות המקור ללא החלפה.
- [x] להוסיף ל-PokemonCard סטטוס אימות, מקור הקשר וסיבת Review; קשרים לא מאומתים נשמרים אך אינם מוצגים כדפי Pokémon.
- [x] להוסיף הגירת אינדקסים לא-הרסנית ל-unique `{language, sourceId}` ב-Cards/Sets ולסמן רשומות legacy כ-en; גיבוי לפני ההגירה נוצר ואומת.
- [x] ליצור ולהריץ `npm run audit:card-integrity` לקריאה בלבד; הסקריפט אינו משנה Cards, קשרים או CollectionItems.
- [x] להחיל את מיפוי Card/Relationship אחרי גיבוי מאומת; עודכנו רק שדות סיווג/קשרים, ו-hash של CollectionItems נשאר `bb46bc35a040afa653e79534132787c68e3df38c976a8072665af69f883d2f6a`.
- [ ] לבדוק את כל קשרי Pokémon ולסווג ידנית מועמדים עמומים אחרי החלת המיגרציה.
- [ ] להוסיף בדיקות אינטגרציה נוספות לאינדקסים ולמקרי כשל באמצע Import.
- [ ] לממש ולבדוק גיבוי/שחזור מתוך הממשק (גיבוי MongoDB לפני ההגירה קיים).
- [ ] לבדוק טיפול עקבי בגרסאות שפה ו-Finish כמפתחות אוסף נפרדים.

## API Integrations

- [x] לבדוק בפועל סכמות PokeAPI ו-TCGdex לפני כתיבת הלקוחות.
- [x] לממש Sync של Pokémon לאומי 1–1025 מ-PokeAPI.
- [x] לממש Sync של סטים ופרטי קלפים מ-TCGdex בשפה האנגלית.
- [x] לשמור Cache/נתונים ב-MongoDB ולתעד מצב/התקדמות Sync.
- [x] להשתמש בנתונים האחרונים שב-MongoDB לתצוגה בזמן שמקור חיצוני אינו נדרש לבקשת UI.
- [x] להשתמש רק ב-TCGdex `dexId` לקשרים מאומתים; לשמור `cameoDexIds` כמקור גלם ולקשרי Review בלבד. אין הסקת קשרים לפי שם או שרשרת אבולוציה.
- [x] לממש סיווג ראשוני שמרני ו-`NEEDS_REVIEW` עבור promo/נתונים לא ברורים.
- [x] לממש סיווג לפי Card category, לכלול רק Pokémon, ולתעד confidence/reason/source; Rarity עמום אינו מוכרע אוטומטית.
- [x] להחיל סינון Pokémon-only וקשר מאומת ב-Pokémon pages, Collection, Missing, Dashboard ו-Collectr; לשמור תאימות בטוחה לרשומות הקיימות עד המיגרציה.
- [x] להריץ Sync נפרד ל-ja, zh-cn, zh-tw ו-ko ולוודא checkpoints ונתוני MongoDB. נשמרו ja: 202 Sets/13,156 Cards; zh-cn: 56/877; zh-tw: 98/7,436; ko: 95/239. כל הריצות הסתיימו ללא כשלים מדווחים.
- [x] לבצע Audit חי לכל 672 ה-Sets מול `/sets` ופרטי Set ב-TCGdex בחמש השפות; לשמור `official`,‏ `total`, רשימות מזהים/מספרים, סטטוס כיסוי, תמונות/rarity חסרים ומספרי פערים ב-Settings.
- [x] להוסיף Re-sync ממוקד ל-Set יחיד ולמנוע Sync מקביל בין תהליכי API.
- [ ] להשלים פערי מקור רב-לשוניים: 424 Sets מלאים, 8 חלקיים ו-240 ללא רשימת Cards (כלומר רשימת המקור ריקה למרות `total` חיובי); אין להשלים Cards ללא נתוני מקור.
- [ ] להשלים זיהוי קטגוריות Alternate Art/Full Art/Special Promo על בסיס נתוני מקור אמינים; אין לסווג לפי Rarity בלבד.
- [x] להוסיף timeout של 45 שניות, עד 4 ניסיונות עם exponential backoff וטיפול ב-429/5xx/שגיאות רשת.
- [x] להוריד concurrency של TCGdex ל-3, לשמור כל Set מיד, להמשיך אחרי כשלי קלפים ולשמור התקדמות כל 25 קלפים.
- [x] להוסיף `POST /api/sync/tcgdex/:language` להפעלה/המשך של שפה בודדת בלי למשוך מחדש את PokeAPI או לדרוס הדפסות אחרות; להציג source warnings על מזהי Set כפולים ו-card lists חסרים.
- [x] לוודא שכל הריצות המוגדרות הושלמו ושהזהויות ייחודיות לפי `{language, sourceId}`. ב-TCGdex יש Set IDs כפולים ברשימות ja/zh-cn; הם נשמרים פעם אחת ומוצגים כאזהרות.
- [x] בסנכרון, לסמן קשרים קודמים לבדיקה, לאמת מחדש קשרי `dexId` ולשמור קשרי cameo/legacy לבדיקה במקום למחוק אותם.

## Collectr Import

- [x] לזהות רשומות בתוך טקסט עמוד Collectr לפי דפוסי מוצר/כמות, ולסנן כותרות UI מוכרות במקום להפוך כל שורה לרשומה.
- [x] לממש Parser לשורות/רווחים משתנים, כמויות, מספרי קלף, rarity, finish, condition ומחירים; לזהות EN/English, JP/Japanese/JPN, CN/SC, TW/TC, KR/Korean/KOR וסימוני שפה מפורשים נוספים בשם או ברשומה.
- [x] לשמר טקסט מקור לכל רשומה ב-ImportHistory ולהציגו ב-Preview.
- [x] להציג ספירות רשומות, התאמות, Needs Review, ללא התאמה ושורות שסוננו.
- [x] להוסיף חיפוש/בחירה ידנית מתוך מאגר הקלפים המלא, ואפשרות מפורשת להשאיר רשומה מחוץ לייבוא.
- [x] להתאים מתוך קטלוג TCGdex לפי Set ID שנמצא בשם מדויק או alias עם `sourceId` משותף מאומת, שפה, `localId`, שם קלף ונדירות; לנרמל אפסים מובילים לצורך השוואה בלבד.
- [x] לקרוא את `cardCount.official` ו-`cardCount.total` שנשמרו מפרטי Set של TCGdex; לאפשר מספר מעל `official` ועד `total`, ולהעביר ל-Needs Review מספור שסותר `total` או מכנה מודפס.
- [x] להשתמש ב-`en` כברירת מחדל ללא סימון שפה, להגביל CN ל-`zh-cn` ו-TW ל-`zh-tw`, לחפש רק בשפה המתאימה גם בהתאמה ידנית, ולחסום התאמה אוטומטית בסימוני שפה סותרים/סינית לא מסוימת.
- [x] לפרש `Promo` כנדירות נפרדת כדי שלא תתווסף פעמיים לשם הסט (למשל `Sword & Shield Promo`).
- [x] לאפשר חיפוש ידני לפי שפת הרשומה (ברירת מחדל `en`); להציג רק הדפסות בשפות המבוקשות, ולהציג קלפים לא-כשירים אך למנוע בחירה/ייבוא שלהם.
- [x] להציג סיבת כישלון התאמה ולדרוש בחירה ידנית כשיש כמה הדפסות אפשריות.
- [x] להוסיף normalization ל-SAR/SIR/IR/AR, confidence והסבר התאמה; alias בין Set names מתקבל רק דרך מזהה TCGdex זהה; שפה לא מסומנת היא `en`, ושפה מפורשת גוברת עליה.
- [x] לדרוש החלטת משתמש מפורשת ב-Commit; התאמות אוטומטיות מה-Preview אינן מיובאות כברירת מחדל.
- [x] לממש Commit שמגדיר כמויות באופן idempotent, אינו מוחק פריטים שלא הופיעו בקלט, ומתעד snapshot ל-Rollback.
- [x] לממש endpoint ל-Rollback של ייבוא שהושלם.
- [x] לאמת את Parser מול העתקת Ctrl+A גולמית שסיפק המשתמש: 270 סמני Qty זוהו, כולל מסך מלא, שפות, תוכן UI ושדות חסרים.
- [x] לבדוק בחשבון Collectr אם Export זמין ללא PRO; המשתמש אישר שנדרש PRO/שדרוג. הייבוא אינו תלוי ב-Export.
- [x] לבנות ממשק להיסטוריית ייבואים, צפייה בפרטי Preview קודם, Re-preview נפרד ו-Rollback עם אישור.
- [ ] להרחיב בדיקות ל-duplicate rows, שמות דומים, וריאציות חסרות, rollback וכשל באמצע Import.

## Testing

- [x] לאמת בתחילת העבודה שלא היו קוד/בדיקות ושאין מאגר Git.
- [x] להוסיף unit/integration tests ל-Review reasons/evidence, פעולות confirm/reject/keep/skip, pagination וסינון, והגנה על CollectionItems וקשרי Pokémon.
- [x] לשמור דוח audit ייעודי ב-`SPECIAL_ART_REVIEW_REPORT.md` עם ספירות, מקורות, גבולות ראיות ונתוני בטיחות.
- [x] אימות 2026-11-11: `npm test` — 100 בדיקות ב-7 קבצים עברו; `npm run build` עבר; `npm audit --audit-level=high` — 0 vulnerabilities.
- [x] להוסיף בדיקות יחידה ל-Parser ולסיווג, כולל דוגמאות המשתמש, רעש UI, טקסט עמוד שטוח, רשומות חסרות ו-100 רשומות (12 בדיקות).
- [x] להריץ Smoke API מול DB ייעודי זמני עם ההעתקה האמיתית (לפני תיקון מנגנון ההתאמה): 270 זיהויים, 1 התאמה אוטומטית, 202 לבדיקה, 67 ללא התאמה; חיפוש/בחירה ידנית, שמירת Unknown וייבוא. DB הזמני הוסר.
- [x] להריץ `npm run build` לאחר השלמת הסנכרון — השרת והלקוח עברו.
- [x] להריץ Smoke מול MongoDB זמני עבור health, Preview, התאמה מדויקת, Commit idempotent ו-Rollback; להסיר את DB הזמני בסיום.
- [x] לאמת מול MongoDB ו-API מקומי את White Flare/Deerling, חיבור ה-Pokémon, סיווג artwork, חיפוש ומסך פרטי Pokémon.
- [x] להריץ `npm test` לאחר תיקוני Commit/filters — 20 בדיקות עברו; בדיקת console בדפדפן לא הושלמה בסבב הנוכחי.
- [x] להוסיף בדיקות אינטגרציה ל-Preview/Commit/Rollback, התאמת Deerling מ-White Flare, נרמול זהות, שפה חסרה, ריבוי הדפסות וסיבות No Match.
- [x] להוסיף בדיקות לסיווג Trainer/Energy, סיווגי Special Art, override ידני, קשרי dexId/cameo, אי-הסקת אבולוציה, Collectr והסתרת קשרים לא מאומתים.
- [x] להוסיף בדיקות API לכך ש-Trainer אינו מופיע ב-Pokémon page/Collection ואינו ניתן ל-Collectr Preview/Commit; CollectionItems נשארים קיימים.
- [x] להוסיף בדיקות לשפות EN/JP/CN/TW/KR, שמות עם כמה סוגריים וסימון שפה סותר; להוסיף בדיקות לתוויות rarity שנשמטו מהעתקת Collectr.
- [x] להריץ לאחר תיקוני Collectr: `npm test` — 91 בדיקות עברו ב-6 קבצים; `npm run build` — server/client עברו; `npm audit --audit-level=high` — 0 vulnerabilities.
- [x] לבדוק API health, תוצאות Deerling/Ivysaur ב-API ובדפדפן, ואת מצב sync מבלי להפעיל Sync נוסף.
- [ ] להשלים בדיקה ידנית של כל דפי Pokémon והקשרים שנותרו ב-`NEEDS_REVIEW`.
- [x] להריץ `npm audit` לאחר עדכון תלויות — 0 vulnerabilities.
- [ ] להוסיף בדיקות אינטגרציה ל-Sync ולמקרי כשל באמצע Import.
- [x] לקבל ולבדוק דוגמת Ctrl+A גולמית אמיתית; נוספו מקרי בדיקה מייצגים ממנה.
- [ ] להשלים בדיקות UI אוטומטיות ונגישות לכל הכפתורים, הסינונים והודעות השגיאה.
- [x] Preview היסטורי מ-2026-11-10 מתוך originalText באורך 87,714: 744 רשומות, 243 Matched, 27 Needs Review, 474 Unmatched ושורה מסוננת אחת. תוצאות Preview מ-2026-11-11 מתועדות בנפרד בהמשך.
- [x] Preview סופי מ-2026-11-11 על originalText המקורי באורך 85,921: 744 רשומות, 243 Matched, 124 Needs Review, 377 Unmatched ו-2 שורות שסוננו. שינוי מול Preview קודם: 7 התאמות שהיו חסרות rarity הועברו ל-Needs Review אחרי תיקון חילוץ 9 תוויות rarity. ביקורת עצמאית של 239 התאמות אוטומטיות אישרה שפה, Set, מספר, שם, rarity מפורשת ו-Pokémon — 0 אי-התאמות; 4 החלטות ידניות נשמרו. CollectionItems נשארו ללא שינוי (SHA-256 `bb46bc35a040afa653e79534132787c68e3df38c976a8072665af69f883d2f6a`); לא בוצע Commit.
- [x] להוסיף לוג לכל רשומת Preview עם Set IDs, `official`/`total`, `localId` שחולץ, קלפים שנמצאו, תוצאות שם/נדירות וסיבת החלטה.
- [x] להציג תמונת TCGdex בכל מועמד עם URL תקין; להציג מצב חסר רק כשאין URL. ל-Bibarel אחד ברשימת Needs Review ה-API השמיט `image` וה-CDN החזיר 404.
- [ ] להוסיף Set aliases רק לאחר אימות. גם בבדיקת `/sets` החיה ה-API אינו מכיל `Abyss Eye`, `Gem Pack Vol. 3` או `Collect 151 Surprise`; Thievul/Cubone/Mew ex נשארו Unmatched ואין לנחש מזהי Set.
- [x] ה-Preview הקודם בדק 17 דוגמאות, אך הוא מתוארך לפני כללי השפה החדשים. ב-Preview הנוכחי אין התאמה שגויה אוטומטית לפי ביקורת הזהות.
- [x] לבדוק UI בדפדפן: שלוש קבוצות, פרטי מועמדים וחיפוש ידני; Preview בלבד, ללא Commit.
- [x] להציג תמונות TCGdex אמיתיות ב-Needs Review יחד עם שם, Set, localId, rarity, שפה וסיבת התאמה; אין להחליף URL תקין ב-placeholder.
- [x] להציג מצב נגיש "No TCGdex image" רק כאשר המקור אינו מחזיר URL תקין או טעינת URL נכשלת.
- [ ] לעבור עם המשתמש על רשומת Needs Review אחת וסיבות ה-Unmatched העדכניות; אין לייבא ללא אישור מפורש.

## UI/UX

- [x] ליצור בסיס עיצוב רספונסיבי, ניווט, רכיבי כרטיסים ומצבי טעינה/שגיאה/ריק.
- [x] להציג אחוזי התקדמות, סטטוס Owned/Missing ונתוני Dashboard אמיתיים.
- [x] להציג גרפים מבוססי נתונים אמיתיים לפי Generation, Type, קטגוריה וסט.
- [x] להוסיף מסננים במסכי Collection/Missing ומיון לפי progress/Pokédex number/card count.
- [ ] להציג מקורות חיצוניים, חותמות זמן, שגיאות Sync ו-Cache באופן מלא.
- [ ] לבצע בדיקת נגישות ושימושיות responsive.

## תשתית ותיעוד

- [x] ליצור package.json בשורש וב-Client/Server, lockfile ופקודת `npm run dev`.
- [x] ליצור `.env.example`, README ולהוסיף `.env` ו-artifacts ל-`.gitignore`.
- [x] ליצור ולעדכן HANDOFF.md, ARCHITECTURE.md ו-TODO.md.
- [x] להגדיר `.env` מקומי ל-MongoDB `Pokedex` ולוודא שהשרת התחבר בהצלחה.
- [ ] לאתחל Git רק אם המשתמש/הסביבה מאשרים; כרגע אין מאגר ולכן אין commit.
