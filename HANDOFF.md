# HANDOFF

## עדכון — רקע Pikachu ל-Collectr Needs Review (2026-11-12)

- נוספו שבע תמונות PNG מקומיות, שקופות ושונות של Pikachu בתנוחות הליכה, טעינה, קפיצה, שינה, הנפה, התקפה ועמידה. הן נגזרו מפריימים שונים של SpriteCollab, מיוחסות ל-CUR, ונשמרו ב-`client/public/images/pikachu-background/` יחד עם README של המקור, תנאי CC BY-NC 4.0 וההסתייגות שזכויות Pokémon עצמן אינן נכללות ברישיון הקהילה.
- הרקע מופיע באזור התוכן בכל מסכי האפליקציה, כולל Pokédex, Dashboard, My Collection, Missing Cards ו-Collectr Import. הוא מקומי, אפור באמצעות CSS ובאטימות אקראית של 12%–18%; המיקום והגודל משנים מעט צורה בכל טעינת אפליקציה אך נשארים סטטיים לאחריה. שכבת הממשק מעליו וה-sidebar/topbar נשארים נקיים. בטאבלט ובנייד מוצגות פחות דמויות, השכבה אינה יוצרת overflow אופקי, ואין אנימציה.
- בדיקת Alpha לקבצים: שבעת ה-PNG הם RGBA ולכולם טווח alpha `(0, 255)`; בדיקת hash אישרה שכל 7 התמונות שונות. לכל PNG נוצר WebP lossless, ופענוחו הושווה byte-for-byte ל-RGBA של ה-PNG. התמונות נטענות מקומית ב-WebP עם `loading="lazy"`; אין בקשת תמונה חיצונית בזמן שימוש.
- בדיקת פריסה חזותית נעשתה בדפדפן ב-1440px (7 דמויות), 820px (5) ו-390px (3). לפני ההרחבה הגלובלית נעשה שימוש ב-HTML fixture; יש לרענן את בדיקת הדפדפן למסך Missing Cards לאחר השינוי הזה. Chrome עשוי לכתוב אזהרת `GLIBCXX_3.4.29` של Snap/libproxy אך עדיין הפיק את קובצי הצילום הקודמים.
- `npm test`: עבר, 106/106 בדיקות. `npm run build`: עבר; שבעת התמונות הועתקו ל-build של Vite. בתחילה sandbox חסם ל-MongoDB הזמני של integration tests פתיחת socket ב-localhost; הרצת הבדיקה עם גישת socket מקומית עברה. `npm` הציג אזהרת גרסה (npm 11.12.0 מול Node 20.10.0).
- שינויי העיצוב לא נגעו בלוגיקת Collectr, בהתאמות, ב-API או במסד הנתונים. לא נוספו או שונו נתוני Cards, CollectionItems או החלטות Review.

## עדכון — Visual Special Art Review (2026-11-12)

- נוספה לשונית `Visual Gallery` בתוך Settings לצד תור הראיות הישן, בלי להחליף אותו. הגלריה מציגה עד 100 קלפים בעמוד, טעינת תמונות `lazy`, Small/Medium/Large, Zoom, ניווט חצים, השוואת שני קלפים, בחירת Set לרצף, פילטרים ומד התקדמות.
- ב-API החי בקריאה בלבד: 1,341 קלפי Pokémon Promo, 847 עם תמונת TCGdex ו-494 ללא URL. לפני שימוש בממשק: 0 נבדקו, 0 אושרו, 0 נדחו; כל 1,341 נשארו Undecided.
- נוספו פעולות A/D/S ו-←/→/Z. Confirm מחייב בחירת קטגוריית artwork קיימת. Confirm/Reject/Keep נרשמים ב-`CardReviewAction` ונשמרים ב-`CardClassificationOverride`; תיקון החלטה מוסיף רשומה להיסטוריה. `NEEDS_REVIEW` נתמך כ-override מפורש כדי ש-Keep Undecided ישרוד Sync.
- ה-API מוגבל ל-Pokémon, `rarity=Promo`, ולשפות `en`, `ja`, `zh-tw`, `zh-cn`. סינון, pagination, decisions והיסטוריה נבדקו מול MongoDB זמני. בקשת GET חיה החזירה שוב 1,341/847/494; לא נשלחו פעולות POST למסד החי.
- בדיקת חלופות תמונה לפי זהות מדויקת מצאה 4 מתוך 494: מקור רשמי יפני אחד (`Nのゾロア`,‏ `SV-P 200`) ושלושה scans קהילתיים באנגלית (`Alakazam MEP 003`,‏ `Alakazam MEP 009`,‏ `Alolan Exeggutor MEP 094`). 490 האחרים לא קיבלו קישור חלופי מאומת בסבב המוגבל; אין להסיק שלא קיימים מקורות אחרים. התמונות החיצוניות מוצגות עם ייחוס, סוג מקור, URL, תאריך וביטחון; לא נכתבו ל-`Card.image` ולא הורדו.
- נוצר ונבדק לפני שינוי enum/schema של ה-override: `/tmp/pokedex-before-visual-special-review-2026-11-12.archive.gz`; בדיקת `mongorestore --dryRun` עברה.
- `npm test`: 106/106; `npm run build`: עבר; `npm audit --audit-level=high`: 0 vulnerabilities. API ו-Vite מחזירים HTTP תקין וה-Summary החי נבדק. בדיקה גרפית מלאה ב-Chrome לא הושלמה: Chrome המקומי נפל בגלל סביבת Snap/`GLIBCXX_3.4.29`; אין לטעון שנבדקו קליקים/תצוגת מודל בדפדפן.
- אין שינוי נתוני Cards, Overrides, `CollectionItems` או קשרי `PokemonCard` בסביבת Pokedex במהלך הבנייה. תוצאות פעולות ההחלטה נבדקו רק ב-DB הזמני של integration tests. שרתי dev נשארו פעילים ב-5173/5000.
- קבצים ששונו/נוספו: `server/src/routes.ts`, `server/src/models.ts`, `server/src/visualReviewImageSources.ts`, `server/src/collectr.integration.test.ts`, `server/src/visualReview.test.ts`, `server/src/classification.test.ts`, `client/src/VisualSpecialArtReview.tsx`, `client/src/visualReview.ts`, `client/src/App.tsx`, `client/src/api.ts`, `client/src/styles.css`, `HANDOFF.md`, `TODO.md`, `ARCHITECTURE.md`, `SPECIAL_ART_REVIEW_REPORT.md`.

המשך: להשלים בדיקת UI גרפית בסביבת Chrome תקינה; להמשיך חיפוש מקורות תמונה עבור 490 קלפים; לעבור על ה-artwork ולהחליט ידנית. אף קלף Promo לא סווג במהלך עדכון זה.

## מצב הפרויקט

נכון ל-2026-11-11, קיימים React/Vite + TypeScript, Express/Mongoose, מסכי ליבה, REST endpoints, Sync ו-Collectr Import. בוצע חיבור למסד `Pokedex`, מודלים עם collection names מפורשים, הוספו שדות PokeAPI מפורשים, ו-Sync של TCGdex תומך ב-batches, retries ו-checkpoints לפי סט. זו עדיין **אינה השלמה של כל דרישות המוצר**; המשימות שנותרו מפורטות ב-TODO.md.

MongoDB המקומי פועל ב-`mongodb://127.0.0.1:27017/Pokedex`. אין למחוק או להעביר נתונים ממסדי נתונים אחרים. אין מאגר Git בתיקייה.

## עדכון אחרון — Smart Special Art Review (2026-11-11)

נבנתה מערכת Review ב-Settings, אך **לא התקבלה או נכתבה החלטה על אף אחד מ-12,373 קלפי `NEEDS_REVIEW`**. בדיקת audit היא קריאה בלבד. ספירות מסד הנתונים בסוף הבדיקה: 45,620 Cards, ‏36,722 PokemonCard relations, פריט CollectionItem אחד, 0 `CardClassificationOverride` ו-0 `CardReviewAction`.

### דוח Review בפועל

| סיבה | כמות | פירוש |
|---|---:|---|
| Rarity חסר | 6,010 | סיבת Review ראשית; כולל `None`/`Unknown` |
| Rarity עמום | 5,022 | סיבת Review ראשית; Rarity כמו Ultra/Secret אינו מוכיח סוג artwork |
| Promo אפשרי | 1,341 | קבוצת מועמדים, לא הוכחה ל-Special Art |
| Alternate Art אפשרי | 0 | לא נמצאה תווית מקור מפורשת |
| Full Art אפשרי | 0 | לא נמצאה תווית מקור מפורשת |
| Metadata חסר | 6,010 | חופף לקלפים ללא rarity מאומת |
| URL תמונה חסר | 5,941 | יתר הקלפים כוללים URL; לא בוצעה בדיקת טעינה לכל תמונה |
| מקור לא מספיק כדי לאשר artwork | 12,373 | קבוצת רוחב: נתוני המקור אינם קובעים את סיווג ה-artwork |

סיבות ראשיות הן חלוקה זרה אחת ומסתכמות ב-12,373. שאר הקבוצות חופפות. נמצאו 6,432 קלפים עם URL תמונה ו-6,363 עם 8/8 שדות metadata (`name`, `setId`, `setName`, `localId`, `language`, `category`, `rarity`, `sourceId`). שפות: en 5,670; ja 3,254; zh-cn 202; zh-tw 3,194; ko 53. כל 12,373 משויכים לקטגוריית Pokémon.

### ראיות ומקורות

- TCGdex הוא מקור השדות הישיר: מזהה הדפסה, שם, Set, `localId`, שפה, קטגוריה, rarity, URL תמונה, artist, variants ו-dex IDs. המסך מציג URL/API source ID, זמן sync וזמן עדכון מקור כאשר קיים. ה-confidence של ראיה מסומן `direct-source-field`; הוא אינו confidence של Special Art.
- TCGdex אינו מספק למועמדים האלה שדה מפורש Alternate Art/Full Art. Promo לבדו אינו ראיה מספקת. אין ניתוח תמונה אוטומטי.
- מאגר Pokémon TCG הרשמי זמין לבדיקה ידנית לפי פרטי קלף ולצפייה ב-artwork, אך לא נמצא crosswalk מהימן בין זהויות הרשומות שלו ל-TCGdex שמאפשר קבלת החלטה אוטומטית. ה-Pokémon TCG API הציבורי מסומן deprecated ולכן לא שולב כמקור החלטה.
- הקישור `Open Source` פותח רשומת TCGdex. תאריך בדיקה הוא מועד sync ששמור בנתונים; לא בוצע refresh רשת ל-12,373 הקלפים במהלך הדוח.

### מה נוסף ובטיחות

- `GET /api/classification/review/summary` מספק ספירות ואפשרויות סינון; `GET /api/classification/review` מספק pagination (עד 100), סינון לפי שפה, Set כולל שפה, rarity, category, Pokémon, reason, תמונה, חיפוש ומצב queue, ומיון לפי ראיות / classifier confidence / completeness.
- ב-Settings מוצגים artwork גדול, זהות ההדפסה, סיבות, ה-confidence הקיים של classifier, metadata completeness, שדות TCGdex ו-history. אין החלטה על שינוי ערך dropdown; Confirm מחייב בחירת סיווג ולחיצה מפורשת.
- Confirm ו-Mark Not Special Art שומרים `CardClassificationOverride` ו-`CardReviewAction` עם evidence snapshot; Keep ו-Skip נשארים `NEEDS_REVIEW` ורק מתועדים. Skip ניתן לסינון ולהצגה מחדש. אין Bulk Action.
- Sync משתמש ב-override לפני סיווג אוטומטי. לא שונתה אף רשומת `CollectionItem`, `PokemonCard` או Card בייצור. נוצר גיבוי לפני מודל/אינדקס חדש ונבדק עם `mongorestore --dryRun`: `/tmp/pokedex-before-smart-special-review-2026-11-11.archive.gz`.

### אימות

- `npm test`: 100 בדיקות עברו ב-7 קבצים (כולל MongoDB זמני).
- `npm run build`: Server ו-Client עברו.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm run audit:classification-review`: נותח מאגר Pokedex בקריאה בלבד; 12,373 מתוך 12,373 נבדקו; לא נכתבו החלטות.
- תמונת השרת המקומי: API ב-5000 ו-Vite ב-5173 היו פעילים; ה-UI החדש זמין ב-Settings אם תהליכי הפיתוח עדיין רצים.

### קבצים שהשתנו במשימה

`server/src/classificationReview.ts`, `server/src/classificationReview.test.ts`, `server/src/auditClassificationReview.ts`, `server/src/models.ts`, `server/src/routes.ts`, `server/src/collectr.integration.test.ts`, `server/package.json`, `package.json`, `client/src/api.ts`, `client/src/App.tsx`, `client/src/styles.css`, `TODO.md`, `HANDOFF.md`, `ARCHITECTURE.md`, `SPECIAL_ART_REVIEW_REPORT.md`.

המערכת מסייעת למיין ולהציג ראיות, אך 12,373 קלפים טרם עברו ביקורת אנושית; אין לטעון שהקטלוג הושלם.

## מצב עדכני — סיווג, כיסוי TCGdex ו-Collectr (2026-11-11)

- נוצר ואומת גיבוי לפני כתיבה: `/tmp/pokedex-before-special-art-and-coverage-2026-11-11.archive.gz`; `mongorestore --dryRun` עבר. רענון הסיווג עדכן 1,475 שדות Card. נותרו 45,620 Cards: 37,707 Pokémon, 6,807 Trainer ו-1,106 Energy. סיווגים: 1,071 `ILLUSTRATION_RARE`, 389 `SPECIAL_ILLUSTRATION_RARE`, 6 `BLACK_WHITE_RARE`, 9 `AMAZING_RARE`, 34 `GALLERY_ART`, 9 `V_SPECIAL_ART`, 14 `VSTAR_SPECIAL_ART`, 3 `VMAX_SPECIAL_ART`, 12,373 `NEEDS_REVIEW` ו-31,712 `EXCLUDED`. בסך הכול 1,535 קלפים מאושרים לסיווגי Special Art. 620 עברו מ-Needs Review לסיווגים מפורשים; שאר עדכוני הסיווג עסקו בראיות/סיבות. אין manual classification overrides.
- בדיקת העדכון אישרה `CollectionItems` ללא שינוי (רשומה אחת; SHA-256 `bb46bc35a040afa653e79534132787c68e3df38c976a8072665af69f883d2f6a`). לא נוספו או נמחקו Cards, קשרים או פריטי אוסף.
- Audit חי של TCGdex בדק את רשימות Sets ופרטי Set לכל 672 ה-Sets הקיימים, ועדכן מטא-נתוני כיסוי בלבד. לא נוספו Cards: בכל שפה כל Card ID ש-TCGdex החזיר כבר היה קיים מקומית; פערי `cardCount.total` נובעים מרשימות מקור חלקיות או ריקות. `official` משמש מספר רשמי ו-`total` כולל Cards נוספים; שניהם נשמרים ברמת Set. ראו [TCGdex sets](https://tcgdex.dev/rest/sets) ו-[TCGdex set detail](https://tcgdex.dev/rest/set).

| שפה | Sets / Cards מקומיים | מלאים / חלקיים / ללא רשימת Cards | `total` / מקומי / פער | ללא תמונה / ללא rarity |
|---|---:|---:|---:|---:|
| en | 221 / 23,912 | 215 / 2 / 4 | 24,140 / 23,912 / 228 | 1,922 / 0 |
| ja | 202 / 13,156 | 119 / 2 / 81 | 19,158 / 13,156 / 6,002 | 9,274 / 665 |
| zh-cn | 56 / 877 | 8 / 0 / 48 | 6,953 / 877 / 6,076 | 877 / 0 |
| zh-tw | 98 / 7,436 | 80 / 3 / 15 | 8,980 / 7,436 / 1,544 | 5,290 / 3,620 |
| ko | 95 / 239 | 2 / 1 / 92 | 7,931 / 239 / 7,692 | 239 / 58 |

- בסך הכול 424 Sets מלאים, 8 חלקיים ו-240 שמחזירים רשימת Cards ריקה. כל IDs שהופיעו ברשימות TCGdex נמצאו מקומית; לא נמצאו כפילויות Card IDs/`localId` במאגר. ברשימות `/sets` היו IDs כפולים: BW3a ו-BW8a ב-ja, ו-CSV1C ב-zh-cn. כשלי מקור נשמרים כ-`PARTIAL`/`MISSING_DATA`; מסך Settings מציג סטטוס לכל Set ומאפשר Re-sync ממוקד. אין לנחש IDs או להשלים קלפים על בסיס רצפים.
- Preview חדש `6af44294a08d35b3e9b544a8` רץ על הטקסט המקורי באורך 85,921 ובו 744 רשומות: 243 Matched, 124 Needs Review, 377 Unmatched ו-2 שורות מסוננות. תיקון ה-Parser חילץ 31 תוויות rarity נוספות מ-33 רשומות שהציגו קודם rarity ריק; לשתי הרשומות שנותרו אין תווית rarity בטקסט המקור. לעומת ה-Preview הקודם, 7 התאמות שבהן rarity לא תאם עברו ל-Needs Review.
- ביקורת זהות עצמאית של כל 239 ההתאמות האוטומטיות אישרה שפה, Set, `localId`, שם, rarity כאשר צוין וקטגוריית Pokémon: 0 אי-התאמות. ארבע החלטות ידניות נשמרו. Thievul/Abyss Eye (`089/081`, en), Cubone/Gem Pack Vol. 3 (`0407/07`, zh-cn) ו-Mew ex/Collect 151 Surprise (`191/151`, zh-cn) נשארו Unmatched כי שמות ה-Sets אינם מופיעים במקור TCGdex שנבדק; לא נוצרו aliases מניחוש.
- שפה ללא סימון מזוהה כ-`en`; סימונים מפורשים גוברים עליה. חיפוש ידני ואוטומטי נשאר מוגבל לשפת ההדפסה. `cardCount.official`/`total` מאמתים מספרים אך מספר לבדו אינו מזהה קלף. Preview חדש נשמר כהיסטוריה; לא בוצע Commit.
- בדיקות סופיות: `npm test` — 91 בדיקות עברו ב-6 קבצים; `npm run build` — server/client עברו; `npm audit --audit-level=high` — 0 vulnerabilities. npm 11.12.0 מציג אזהרת תאימות עם Node 20.10.0.
- ה-API החי מחזיר `/api/health` עם MongoDB מחובר; Vite ו-API מגיבים ב-5173 וב-5000. `npm run dev` נוסף נעצר כי הפורטים כבר היו תפוסים.

## ביקורת קדם-מיגרציה — היסטורית

הסיכום הבא מתעד את ה-Dry Run שבוצע לפני המיגרציה; המיגרציה הוחלה לאחר מכן כמפורט במצב העדכני לעיל.

- נוצר `server/src/classification.ts` כשירות סיווג שמזהה `POKEMON | TRAINER | ENERGY | OTHER | UNKNOWN`, שומר confidence/reason/source/reviewed, מוציא Trainer/Energy, ותומך ב-IR/AR, SIR/SAR, Character Rare/Super Rare, Alternate Art, Full Art ו-Special Art Promo כאשר קיימת ראיית מקור מפורשת.
- סנכרון חדש ישתמש ב-TCGdex `dexId` בלבד לקשרים מאומתים. `cameoDexIds` וקשרים legacy נשמרים לסקירה ואינם מופיעים ב-Pokémon pages. אין הסקת קשרים לפי שם או evolution chain.
- Pokémon pages, Collection, Missing, stats ו-Collectr בודקים סוג קלף וזכאות; Collectr לא מציע/מקבל Trainer, Energy או קלף שאינו Special Art. CollectionItems קיימים נשארים במסד אך קלפי non-Pokémon אינם מוצגים באוסף.
- נוצר `npm run audit:card-integrity` שמחשב Dry Run מבלי לכתוב ל-MongoDB. הוא רץ מול `Pokedex` ב-2026-11-10.
- Dry Run: 45,620 Cards; 37,707 Pokémon, 6,807 Trainer ו-1,106 Energy לפי source category. 103 שדות category חסרים ברמה העליונה ושוחזרו מ-`sourceData.category`; לא נותר type UNKNOWN לפי המקור הקיים.
- סיווג מתוכנן: 626 `ILLUSTRATION_RARE`, 216 `SPECIAL_ILLUSTRATION_RARE`, 31,746 `EXCLUDED`, ו-13,032 `NEEDS_REVIEW` (6,010 rarity חסר/None; 618 rarity special מפורש בלי URL תמונה; 6,404 ראיות עמומות/לא נתמכות). שינויים בערך classification: 9,274.
- 12 Character Rare ו-4 Character Super Rare חדשים ייכללו בסיווגי Illustration/Special Illustration. לא זוהו Alternate Art, Full Art או Special Art Promo חדשים באופן מאומת מתוך metadata המקומי; 3,391 Ultra Rare/Secret Rare/Promo נשארים לבדיקה ולא מסווגים אוטומטית.
- נמצאו 43 Trainer cards שסווגו בעבר כ-Special Art ו-105 קישורים שלהם לעמודי Pokémon. מתוך 36,722 קשרים, 2,092 אינם נתמכים בקטגוריה וב-`dexId`; 1,106 קלפים מקושרים כיום ליותר מ-Pokémon אחד, ומתוכם 265 נשארים עם יותר מקשר `dexId` מאומת אחד. הקשרים מסומנים לבדיקה במקום להימחק.
- תוכנית המיגרציה מעדכנת metadata של 45,620 Cards וסטטוס של 36,722 קשרים; היא אינה מוחקת Cards או קשרים ואינה משנה CollectionItems. אין קשרים מאומתים חדשים להוספה. כפילויות `(language, sourceId)` ב-Cards/Sets: 0/0.
- CollectionItems: רשומה אחת; SHA-256 של snapshot לפני המיגרציה: `bb46bc35a040afa653e79534132787c68e3df38c976a8072665af69f883d2f6a`. גיבוי `mongodump` קיים ונבדק ב-`/home/hilma/.copilot/session-state/3ffd9701-28dc-499b-8e36-a18bc87c64e9/files/pokedex-classification-backup-20261110.archive.gz`; בדיקת `mongorestore --dryRun` לא שחזרה נתונים.
- סטטוס Sync במסד: `status=completed`; `tcgDexStatus` העליון עדיין מציג `running` מאז העדכון הישן, אך כל locale הסתיימו ואין Sync פעיל ידוע. אין להפעיל Sync נוסף במקביל.
- המיגרציה המתוכננת בסיכום ההיסטורי הוחלה לאחר גיבוי מאומת; השדות החדשים במסד אומתו ב-Dry Run חוזר.

## מצב עדכני — המשך 2026-11-10

- שירותי API ו-Vite הופעלו מחדש אחרי שנמצאו כבויים; `/api/health` החזיר `connected` ל-`Pokedex`, והלקוח החזיר HTTP 200.
- ה-Sync האנגלי נשאר 221 Sets ו-23,912 Cards. ב-TCGdex `/sets` סכומי `cardCount.total` מסתכמים ב-24,140; לכן קיימת אי-התאמה של 228 בין metadata לבין כרטיסים שנשלפו מפרטי הסט.
- הופעלו Sync נפרדים ל-ja, zh-cn, zh-tw ו-ko. MongoDB מכיל: ja 202 Sets/13,156 Cards; zh-cn 56/877; zh-tw 98/7,436; ko 95/239. כל הריצות הסתיימו ללא כשלים מדווחים.
- בדיקת API המקור הראתה 204 רשומות ja אך רק 202 מזהי Set ייחודיים (BW3a ו-BW8a כפולים), ו-57 רשומות zh-cn אך 56 מזהים ייחודיים (CSV1C כפול). פרטי סט רבים מחזירים רשימת `cards` ריקה למרות `cardCount.total` חיובי; נשמרות אזהרות ב-SyncStatus ומוצגות ב-Settings. אין לטעון שהכיסוי המקומי מלא ביחס ל-TCGdex.
- הספירות הכוללות אומתו מול MongoDB: 672 Sets ו-45,620 Cards (en/ja/zh-cn/zh-tw/ko), ללא כפילויות `{language, sourceId}` ב-Cards או ב-Sets; 36,722 קשרי PokemonCard.
- נוסף `GET /api/filters/options` שמחזיר Pokémon, Sets, languages ו-categories מהמאגר המלא. ב-Collection/Missing נוספו סינון Pokémon ומיון לפי Pokédex, התקדמות וכמות Cards. Commit Collectr תוקן כך שרק בחירה מפורשת מה-UI נכנסת לאוסף.
- ה-Preview של 243/27/474 והפירוט שאחריו הם תוצאות היסטוריות מ-2026-11-10; הנתונים העדכניים מ-2026-11-11 מופיעים בראש המסמך.
- גם ב-Preview החדש לא נוספו aliases לשמות Set שאינם מאומתים. בדיקת TCGdex הנוכחית לא מצאה את Abyss Eye, Gem Pack Vol. 3 או Collect 151 Surprise, ולכן שלוש דוגמאות הקלפים נשארו Unmatched.
- לא בוצע Collectr Commit; `collectionitems` נשאר עם אותה רשומה ואותו hash.
- בדיקות עדכניות: `npm test` עבר עם 91 בדיקות ב-6 קבצים; `npm run build` עבר; `npm audit --audit-level=high` מצא 0 vulnerabilities.

## מה הושלם ונבדק

- נוצרו מסמכי HANDOFF.md, ARCHITECTURE.md ו-TODO.md.
- נוצר workspace של npm עם `npm run dev`, `npm run build` ו-`npm test`; נוספו `.env.example`, `.gitignore` ו-README.md.
- נבנה צד לקוח React + Vite + TypeScript עם React Router, TanStack Query, Tailwind, Lucide ו-Recharts כתלות. קיימים מסכי Pokédex, Dashboard, פרטי Pokémon, אוסף, חסרים, Collectr Import ו-Settings.
- נבנה API Express/Mongoose עם מודלי Pokemon, Card, PokemonCard, CollectionItem, Set, ImportHistory, CardClassificationOverride, UserSettings ו-SyncStatus.
- כל מודל מצביע ל-collection name מפורש; `Pokedex.pokemons` קיים. השרת מוודא לאחר `mongoose.connect` שה-DB הפעיל הוא `Pokedex` ומדווח שגיאה אם החיבור נכשל.
- נוספו endpoints לקריאת נתונים, ניהול כמות באוסף, סיווג ידני, Preview/Import/Rollback, היסטוריית ייבואים ו-Sync.
- נבדקו בפועל מבני PokeAPI ו-TCGdex לפני כתיבת האינטגרציה. יש סנכרון של Pokémon ושל סטים/קלפים, עם שמירה מתקדמת ב-MongoDB ושימור overrides.
- Parser Collectr מזהה שפה לפי סימונים בשם או ברשומה; ללא סימון השפה היא `en`. JP/JPN/Japanese הם `ja`, CN/SC הם `zh-cn`, TW/TC הם `zh-tw`, ו-KR/KOR/Korean הם `ko`. סימונים סותרים או Chinese לא מסוים דורשים Review.
- ההתאמה מתבססת על Set ID מ-TCGdex, שפה, `localId`, Card Name ו-Rarity. Set name יכול להתאים ישירות או דרך שם בשפה אחרת רק כאשר ל-Set אותו TCGdex `sourceId`. אפסים מובילים מנורמלים להשוואה; `cardCount.official` ו-`total` מאמתים מספור אך אינם מחליפים זיהוי זהות.
- ה-Preview מחזיר סיבת כישלון מפורטת; מספר+סט מתאימים עם שם/נדירות שונים מוצגים ב-Needs Review. חיפוש מועמדים ידני מוגבל לשפת הרשומה (ברירת מחדל en). Condition, Finish ומחיר נשמרים אך אינם תנאי זהות.
- לכל רשומת Preview נכתב log עם Set, `official`/`total`, `localId`, cards שנמצאו, בדיקות שם/נדירות וסיבת החלטה. מועמדי Needs Review מציגים תמונת TCGdex ופרטי זהות; placeholder מופיע רק כשאין URL תקין.
- נבדקו בפועל ב-TCGdex הסט White Flare (`sv10.5w`) ו-Deerling (`sv10.5w-091`): `localId=091`, `rarity=Illustration rare`; פרטי הסט כוללים 173 קלפים ומכילים את מזהה Deerling. תהליך Sync הקיים אוסף מזהי קלפים מכל פרטי הסטים ושומר את שדות הזהות האלה.
- נוספו בדיקות MongoDB אינטגרטיביות ל-Preview/Commit/Rollback, Deerling, normalization, נתוני עותק חסרים, ריבוי הדפסות וסיבות mismatch.
- נוספו בדיקות לדוגמאות Collectr שסיפק המשתמש, טקסט עם כותרות UI, טקסט שהופרד ברווחים, שדות חסרים, 100 רשומות וטקסט UI ללא קלפים.
- העתקת Ctrl+A קודמת הכילה 270 רשומות ונבדקה לפני תיקון מנגנון ההתאמה. המשתמש סיפק כעת טקסט עם 744 סמני `Qty`; ה-Parser זיהה 744 רשומות ו-1 שורה מסוננת (745 בלוקים/שורות קלט). רשומת Deerling מ-White Flare נותחה ל-`091/086`, `Illustration Rare`, `Near Mint`, `Holofoil`, כמות 1 ומחיר $16.68.
- לפני טעינת TCGdex, ה-Preview של Deerling החזיר No Match עם הסבר שהסט חסר. לאחר השלמת Sync, הנתונים נבדקו שוב ב-MongoDB וב-API המקומי.
- ה-API הציבורי של TCGdex מאשר את Deerling ב-White Flare: `sv10.5w-091`, מספר `091/086`, `Illustration rare`. קישור התמונה: `https://assets.tcgdex.net/en/sv/sv10.5w/091`.
- סנכרון הבסיס באנגלית הושלם ב-2026-11-10: PokeAPI 1,025/1,025; TCGdex 221 מזהי Set ו-23,912 Cards. בהמשך נוספו Syncs לשפות ja/zh-cn/zh-tw/ko; ראו את הספירות והאזהרות בסעיף "מצב עדכני". Sync חוזר משתמש ב-upsert על מזהי מקור ובאינדקסים ייחודיים.
- White Flare מכיל 173/173 קלפים. `sv10.5w-091` נשמר כ-Deerling עם `localId=091`, `cardCount.official=86` (הייצוג `091/086`), נדירות `Illustration rare` ותמונת TCGdex אמיתית. ב-API ובדפדפן הקלף מופיע בעמוד Deerling ולא בעמוד Sawsbuck: קשר cameo legacy אינו נחשב מאומת.
- אומת ב-API המקומי ובאתר: חיפוש Pokédex ל-Deerling מחזיר #585, וחיפוש הקלפים והמסך `/pokemon/585` מציגים את Deerling מ-White Flare · 091. תמונת הקלף מוגשת מהכתובת השמורה ב-MongoDB.
- ה-Preview הראשון על טקסט Collectr המלא: 87,714 תווים, 744 סמני Qty, 268 Matched, 45 Needs Review ו-431 Unmatched. התוצאה העדכנית אחרי Sync רב-לשוני מופיעה בסעיף "מצב עדכני".
- Deerling בשורה 141 זוהה ב-Preview הישן עם White Flare, Illustration Rare, 091/086, Near Mint, Holofoil, Qty 1 ומחיר $16.57; לפי כלל ישן השפה נשמרה `unknown`. הכלל הנוכחי הוא `en` כברירת מחדל, וההתאמה כוללת כעת Set ID ושפה.
- ביקורת קודמת ל-268 ההתאמות מצאה אפס שגיאות. ביקורת חוזרת אחרי סנכרון רב-לשוני מצאה אפס חריגות ושימרה את אותם Card IDs. סיכומי שפות/Unmatched היסטוריים אינם מייצגים את ה-Preview העדכני.
- ה-Preview נשמר כ-ImportHistory במצב `previewed`; לא בוצע Commit. אוסף המשתמש לא שונה; במסד יש CollectionItem יחיד עם כמות 0.
- המשתמש בדק את Export בחשבונו ואישר שנדרש PRO/שדרוג. הייבוא אינו תלוי בייצוא CSV.
- התוצאות העדכניות: `npm test` עבר עם 91 בדיקות ב-6 קבצים; `npm run build` עבר; `npm audit --audit-level=high` מצא 0 vulnerabilities.
- בדיקת Smoke מול MongoDB זמני עברה עבור `GET /api/health`, `POST /api/collectr/preview`, התאמה מדויקת, Commit חוזר idempotent ו-Rollback; מסד הנתונים הזמני ותהליך השרת הופסקו והוסרו.

## מה עדיין לא הושלם

- עדיין חסרים גיבוי/שחזור מתוך UI, pagination לרשימות API כלליות ובדיקות UI אוטומטיות/נגישות מלאות. pagination קיים בתור Smart Review.
- Sync לפי ja/zh-cn/zh-tw/ko מומש והורץ. ה-Audit החי תיעד 240 Sets שבהם רשימת Cards ריקה ו-8 חלקיים; חסרים נתוני מקור כדי להשלים אותם. יש לאתר מקור מאומת נוסף או להמתין לעדכון TCGdex, ללא יצירת נתונים.
- שמות Collectr כגון Violet ex, Abyss Eye, Gem Pack Vol. 3 ו-Collect 151 Surprise אינם נמצאים בנתוני TCGdex שנבדקו. אין ליצור aliases עד שאפשר להוכיח התאמה ל-source ID; שלוש הדוגמאות האחרונות נשארו Unmatched.
- 14 קלפים שהותאמו אוטומטית ו-Bibarel אחד ב-Needs Review חסרים URL תמונה בנתוני TCGdex. בבדיקת Bibarel גם נתיב נכס CDN החזיר 404; ה-UI מראה מצב חסר במקום קובץ שבור.
- סיווג הקלפים הוא שמרני וראשוני; הוא אינו מנתח תמונות, וקלפים עמומים נשארים ב-`NEEDS_REVIEW`.
- יש suite אינטגרציה אוטומטי ל-Collectr מול MongoDB זמני; Sync ובדיקות UI עדיין לא מכוסים אוטומטית.
- 12,373 קלפים נשארו ב-`NEEDS_REVIEW`; מסך Smart Review קיים, ונדרשת בדיקת artwork ואישור ידני. CollectionItems נשמרו.
- אין metadata מספיק כדי לזהות באופן מאומת Alternate Art/Full Art עבור רוב המועמדים. נדרש Review ידני/מקור אמין נוסף לפני שינוי הסיווגים האלה.

## המשימה הבאה והצעד הראשון

להשתמש במסך Smart Review לבדיקת הקלפים לפי קבוצות עבודה. יש לאשר/לדחות כל קלף מפורשות על סמך artwork ומזהה הדפסה; להוסיף מקור אוטומטי נוסף רק לאחר crosswalk מדויק ל-TCGdex. 12,373 מועמדים עדיין לא אומתו ו-Collectr Commit עדיין מחייב בחירה מפורשת.

משימות המשך כלליות:

1. לוודא ש-`.env` נשאר מכוון ל-`mongodb://127.0.0.1:27017/Pokedex`; אין להוסיף את `.env` ל-Git.
2. שרת API ולקוח Vite פועלים כעת; אין לערוך `server/src` במהלך Sync עתידי כי tsx watch מאתחל את השרת.
3. להמשיך לפי TODO.md, בעדיפות למיפויי Set מאומתים, כיסוי מקור TCGdex, בדיקות UI ו-Pagination.

## קבצים שנגעו בהם

- מסמכים: HANDOFF.md, ARCHITECTURE.md, TODO.md, README.md.
- Collectr Import: server/src/collectr.ts, server/src/collectr.test.ts, server/src/collectr.integration.test.ts, server/src/cardMatching.ts, server/src/routes.ts, server/src/app.ts, client/src/api.ts, client/src/App.tsx, client/src/styles.css.
- תצורה: package.json, package-lock.json, .gitignore, .env.example.
- Client: client/package.json, client/tsconfig.json, client/vite.config.ts, client/postcss.config.js, client/tailwind.config.js, client/index.html, client/src/api.ts, client/src/main.tsx, client/src/App.tsx, client/src/styles.css, client/src/vite-env.d.ts.
- Server: server/package.json, server/tsconfig.json, server/src/app.ts, server/src/index.ts, server/src/config.ts, server/src/models.ts, server/src/routes.ts, server/src/integrations.ts, server/src/classification.ts, server/src/classification.test.ts, server/src/refreshCardClassification.ts, server/src/catalogCoverage.ts, server/src/catalogCoverage.test.ts, server/src/catalogCoverageReport.ts, server/src/auditTcgdexCoverage.ts, server/src/cardIntegrity.ts, server/src/cardIntegrity.test.ts, server/src/auditCardIntegrity.ts, server/src/collectr.ts, server/src/collectr.test.ts, server/src/collectr.integration.test.ts.

## בעיות ומגבלות ידועות

- אין Git: `git status` מחזיר `not a git repository`; לא נוצר commit. הקבצים נשמרו בסביבת העבודה אך אינם מנוהלים ב-Git.
- MongoDB פועל ב-27017. שרת API ולקוח Vite פועלים ברקע מול `Pokedex`.
- הממשק וה-API הם שלב ראשון. יש לקרוא את TODO.md לפני שמציגים את האפליקציה כמושלמת.
- בטרמינל קיים npm 11.12 עם Node 20.10, והשילוב מציג אזהרת תאימות של npm. התקנת התלויות ועדכון ה-lockfile הושלמו באמצעות npm 10.8.2; build/tests עברו בסביבת העבודה.

## בדיקות ותוצאות אחרונות

- Build: `npm run build` עבר לאחר ההשלמה.
- Tests עדכניים אחרי תיקון rarity של Collectr: `npm test` עבר עם 91 בדיקות ב-6 קבצים.
- Runtime smoke: עבר מול MongoDB מקומי ובסיס נתונים ייעודי אקראי על העתקת 270 הרשומות האמיתית: Preview וספירות, התאמה מדויקת, חיפוש/בחירה ידנית, טיפול בשדות חסרים וייבוא. השרת וה-DB הזמני נסגרו וה-DB נמחק.
- Dependency audit: `npm audit` — 0 vulnerabilities.
- Runtime נוכחי: API ב-5000 מחובר למסד `Pokedex`; Vite ב-5173 מחזיר HTTP 200.


## עדכון לאחר קבלת ZIP ותיקון Sync

- נבדק קוד `server/src/integrations.ts`: Sync המקורי השתמש ב-timeout של 20 שניות, concurrency של 8 בקשות לפרטי סט ו-12 לקלפים, ללא retries. כשל יחיד עצר את כל שלב TCGdex.
- שופר fetch משותף ל-PokeAPI/TCGdex: timeout ברירת מחדל 45 שניות, 4 ניסיונות, exponential backoff, כיבוד `Retry-After` עבור 429, ו-retry ל-408/425/429/5xx ולשגיאות רשת. ניתן לכוונן דרך `TCGDEX_TIMEOUT_MS` ו-`TCGDEX_RETRIES`.
- Sync TCGdex משתמש כעת ב-concurrency של 3. כל Set נשמר מיד לאחר שליפתו, גם אם סט אחר נכשל. כשלי קלפים אינם עוצרים את שאר הקלפים; התקדמות נשמרת כל 25 קלפים. בסיום מתקבלת שגיאה מסכמת עם מספר הסטים/קלפים שנשמרו ומספר הכשלים, כדי שאפשר יהיה להריץ שוב.
- נוסף endpoint `POST /api/sync/tcgdex` שמריץ רק את TCGdex, ללא הורדה מחדש של 1,025 רשומות PokeAPI.
- בדיקת TypeScript לשרת וללקוח עברה. Vite production build עבר לאחר תיקון הרשאות הרצה של esbuild שנפגעו בחילוץ ZIP.
- בבדיקה קודמת עברו 17 בדיקות; מספר זה הוחלף בתוצאת 20 הבדיקות העדכנית בראש המסמך.
- תיקון המשך: TCGdex נגיש בסביבה הזו והסנכרון בפועל רץ מול ה-API; הדיווח ההיסטורי על DNS חסום מתייחס לניסיון מוקדם ואינו המצב הנוכחי.
- מצב הבסיס ההיסטורי (לפני שפות נוספות): `/api/sync/status` היה `completed`, 221 Sets ו-23,912 Cards באנגלית. מצב השפות הנוכחי מפורט בראש המסמך וכולל אזהרות על מקור TCGdex חסר.
- Preview מלא היסטורי הסתיים: 744 רשומות, 268 Matched, 45 Needs Review, 431 Unmatched, שורה מסוננת אחת; תוצאת ה-Re-preview העדכנית מפורטת בראש המסמך. לא בוצע Commit.

## עדכון UI/UX — Pokémon Trainer Hub

- הועבר ה-Sidebar לימין. במסכים צרים הוא הופך לסרגל ניווט קומפקטי בתחתית. הלוגו משתמש ב-Pokéball מבוסס CSS, ומצב החיבור, מספר Pokémon שנסרקו ואחוז ההשלמה מוצגים מנתוני ה-API.
- נבנתה שפה עיצובית משותפת: אדום Pokémon כאקסנט, צבעי Type עקביים, טיפוגרפיה וריווח מוגדלים, כרטיסים מדורגים, תנועות Hover וכניסה קצרות, והתאמה ל-`prefers-reduced-motion`.
- מסך Pokédex כולל אזור פתיחה, ארבעה מדדי אוסף חיים, חיפוש שניתן לנקות, Type chips צבעוניים, תווית סטטוס קריאה יותר וכרטיסים עם מסגרת גרדיאנט לפי סוגי Pokémon.
- עמוד Pokémon כולל Hero צבעוני לפי Type, פילטרים לקלפים וחלונית תצוגה עם פרטי ההדפסה. My Collection ו-Missing Cards כוללים Grid/List; כרטיסי האוסף מציגים תמונות ופקדי כמות, עם סינון קיים.
- Dashboard מציג Trainer Profile ורמת אוסף לצורכי משחק בלבד, התקדמות, פילוחים והישגים שמחושבים מנתוני האוסף. Collectr Import קיבל Stepper ויזואלי, בלי שינוי מנגנון Preview/Review/Commit. Settings קיבל עיצוב אחיד.
- נוסף Dark Mode שנשמר בשדה `theme` של `usersettings` דרך `/settings/preferences`; PUT לעדכון העדפות תומך בעדכון `filters` או `theme` בנפרד.
- בדיקות ב-2026-11-10 לאחר data integrity: `npm run build` עבר; `npm test` עבר עם 58 בדיקות. המספר הוחלף בתוצאת 91 הבדיקות העדכנית בראש המסמך.
- UI ו-API פעילים ב-localhost; `/api/health` החזיר `connected` למסד `Pokedex`. ניסיתי ללכוד מסכים ב-Chrome headless, אך Chrome בסביבה לא השלים טעינה/שמירת צילום עקב ספריית Snap (`GLIBCXX_3.4.29` חסרה); לא בוצעה בדיקה חזותית ידנית של כל המסכים.
- npm מציג אזהרה קיימת: npm 11.12 מצפה ל-Node 20.17+, בעוד סביבת הפרויקט משתמשת ב-Node 20.10. Build ובדיקות בכל זאת עברו.

## עדכון — Promo Special Art ו-Allowlist שפות (2026-11-11)

- Dry run לקריאה בלבד נותח על כל 1,341 מועמדי Promo שב-`NEEDS_REVIEW`. כולם `rarity=Promo`, קטגוריית TCGdex היא Pokémon, וכל שדות הזהות (sourceId, שם, Set, localId, שפה, קטגוריה ו-source URL) קיימים. ל-847 יש URL תמונה; 494 ללא URL. כל 847 כתובות הנכס הזמינות נמשכו בהצלחה ונבדקו ויזואלית מתוך TCGdex.
- חלוקת שפות: en 1,081, ja 213, zh-tw 47. חלוקת Sets: en — xyp 194, svp 216, swshp 293, smp 244, hgssp 24, mep 109, miscp 1; ja — SV-P 143, M-P 70; zh-tw — SV-P 47. אין מועמדי zh-cn ברשימה הזאת. כל 1,341 מועמדים הם Pokémon, לא Trainer/Energy.
- תוצאת dry run: 0 Promo Special Art שאושרו כוודאיים; 0 Promo שסווגו בוודאות כרגילים; 1,341 נשארו `NEEDS_REVIEW`. TCGdex מספק מקור זהות ותמונה, אבל לא תווית Alternate Art/Full Art. תמונה לבדה ו-rarity=Promo אינן ראיה מספקת, ולא נמצא crosswalk מאומת ממקור נוסף לכל sourceId. אין להחיל סיווגים עד לאישור מפורש ובדיקה ברמת ההדפסה. לא נכתבו Cards, Overrides, CollectionItems או קשרי Pokémon במסד כתוצאה מה-dry run.
- האפליקציה מציגה כעת רק `en`, `ja`, `zh-cn`, `zh-tw` בכל מסכי הקלפים, הסטטיסטיקות, הסינונים, Settings ו-Smart Review. מסנני ה-API והספירות בודקים את רשימת השפות; נתוני ko ושפות אחרות נשארים ב-MongoDB.
- Collectr Preview של שפה שאינה מאושרת מסומן `unmatched` עם סיבת `Unsupported language`, בלי מועמדים. חיפוש ידני מחזיר רשימה ריקה; API של החלטה ו-Commit דוחים בחירה בשפה לא מאושרת. הטקסט המקורי והיסטוריית הייבוא נשמרים.
- העדפות פילטר קיימות שמכילות `ko` או שפה אחרת מוחזרות לתצוגה עם ערך שפה ריק; ערכי `UserSettings` שנשמרו אינם משתנים, כפי שנבדק באינטגרציה.
- נוספה בדיקת אינטגרציה לשפות המוסתרות: היא מאמתת את מסכי/API הקטלוג, Collection, Missing, Dashboard, Review, Settings ו-Collectr, ומוודאת ש-Cards, Sets, קשרי Pokémon ו-CollectionItems ב-ko/fr נשארים במסד ללא שינוי.
- בדיקות סופיות ב-2026-11-11: `npm test` עבר עם 101 בדיקות ב-7 קבצים; `npm run build` עבר לשרת וללקוח; `npm audit --audit-level=high` מצא 0 vulnerabilities. npm 11.12 מציג אזהרת תאימות קיימת עם Node 20.10.0.
- בדיקת GET מול השרת הפעיל אישרה חיבור ל-`Pokedex`, 45,381 Cards ו-577 Sets בשפות המוצגות, ו-12,320 קלפים מוצגים ב-Review (53 רשומות ko נשארות מוסתרות). Summary ו-Coverage מציגים רק את ארבע השפות המאושרות; לא נשלחה בקשת כתיבה.
