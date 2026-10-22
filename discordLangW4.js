// ============ ЯЗЫКИ ОТВЕТОВ БОТА, ЧАСТЬ 4: Հայերեն, Azərbaycan, Қазақша, Afrikaans ============
// Те же ключи, что в discordLang.js; подстановки в фигурных скобках не переводятся.
'use strict';

const PACKS = {
  /* ---------- Հայերեն ---------- */
  hy: {
    name: 'Հայերեն', locale: 'hy',
    s: {
      warn: 'Զգուշացում', mute: 'Լռեցված է', ban: 'Արգելափակված է', unmute: 'Լռեցումը հանվել է', unban: 'Արգելափակումը հանվել է', unwarn: 'Զգուշացումները հեռացվել են',
      removed: 'Հաղորդագրությունը ջնջվել է', rule: 'Կանոն', reason: 'Պատճառ', other: 'Այլ', customWords: 'Այս սերվերում արգելված բառեր',
      nativeWord: 'Սերվերի AutoMod կանոն', noReason: 'Պատճառ նշված չէ', by: 'Տրվել է՝ {who}', byBot: 'Ավտոմատ, բոտի կողմից', caseN: 'Դեպք {n}',
      ofLimit: '{n} / {limit}', forever: 'Ընդմիշտ', permanent: 'Մշտական արգելափակում', nextMute: '30 օրվա ընթացքում {limit} զգուշացման դեպքում՝ 1 ժամ լռեցում։',
      escalated: 'Զգուշացում {n} / {n}՝ լռեցված է {d}։ Հաշվարկը սկսվում է նորից։', escalatedBlocked: 'Զգուշացում {n} / {n}։ Հաշվարկը սկսվում է նորից։',
      tally: 'Հաշվիչ', untilLabel: 'Մինչև', lifts: 'Կավարտվի', banWord: 'արգելափակում', status: 'Կարգավիճակ', notApplied: 'Չկիրառվեց՝ {why}',
      ownerBlocked: 'սերվերի սեփականատիրոջը հնարավոր չէ լռեցնել կամ արգելափակել', adminBlocked: 'ադմինիստրատորներին հնարավոր չէ լռեցնել',
      failed: 'Ձախողվեց՝ բոտը թույլտվություն չունի', canTalk: 'Կրկին կարող է խոսել', backIn: 'Կրկին կարող է միանալ սերվերին', clean: 'Գրառումն այժմ մաքուր է',
      mistake: 'Կարծո՞ւմ եք՝ բոտը սխալվել է։ Գրեք սեփականատիրոջը։', warnsAddShort: 'Զգուշացումները գումարվում են՝ 30 օրում երրորդը նշանակում է 1 ժամ լռեցում։',
      updated: 'Թարմացվել է {d}', actNone: 'ՋՆՋՎԱԾ', actWarn: 'ԶԳՈՒՇԱՑՈՒՄ', actMute: 'ԼՌԵՑՈՒՄ {d}', actBan: 'ԱՐԳԵԼԱՓԱԿՈՒՄ {d}',
      serversTitle: 'Սերվերներ', onlineN: '{n} առցանց', noRoomsNow: 'Այս պահին սենյակներ չկան։ Սեղմեք «Խաղալ», և նոր սենյակ կբացվի։', stOpen: 'բաց է', stFull: 'լիքն է',
      stFreeing: 'տեղ է ազատվում', phHiding: 'Թաքնվելը', phHunt: 'Որսը', phStory: 'Պատմությունն ավարտվեց', leftT: 'մնացել է {t}', mapN: 'քարտեզ {m}',
      moreRooms: '+ ևս {n} սենյակ', refresh: 'Թարմացնել', playNow: 'Խաղալ հիմա', gRaceMode: 'Մրցավազք', gHnsMode: 'Թաքնվոցի', playersN: '{n} խաղացող',
      playerN: '1 խաղացող', roomsN: '{n} սենյակ', roomN: '1 սենյակ', upTo40: 'յուրաքանչյուրում մինչև 40 խաղացող',
      openProfile: 'Բացել պրոֆիլը', tabProfile: 'Պրոֆիլ', tabMaps: 'Քարտեզներ', tabFriends: 'Ընկերներ', perToday: 'Այսօր', perWeek: 'Այս շաբաթ', perAll: 'Ողջ ժամանակ',
      joined: 'Գրանցվել է {d}', coinsL: 'Մետաղադրամներ', raceScores: 'Մրցավազքի միավորներ', hsScores: 'Թաքնվոցիի միավորներ', noRank: 'առանց աստիճանի', aboutL: 'Իմ մասին',
      nothingWritten: 'Դեռ ոչինչ գրված չէ', todayWord: 'այսօր', weekWord: 'այս շաբաթ', noMapsYet: 'Դեռ հրապարակված քարտեզներ չկան', noFriendsYet: 'Դեռ ընկերներ չկան',
      published: 'Հրապարակվել է {d}', inGameTag: 'խաղում է', likesN: 'հավանել են {a} · չեն հավանել {b}', onlineNowTag: 'հիմա առցանց', minAgo: '{n} րոպե առաջ',
      hAgo: '{n} ժամ առաջ', dAgo: '{n} օր առաջ', longAgo: 'վաղուց', friendsL: 'Ընկերներ', mapsL: 'Քարտեզներ', moreN2: '+ ևս {n}', race: 'Մրցավազք', hns: 'Թաքնվոցի',
      rulesTitle: 'AIBROFIST սերվերի կանոնները'
    },
    rules: ['Սպամ չի թույլատրվում', 'Այլ Discord սերվերների հրավերներ չի թույլատրվում', 'Մեծահասակների բովանդակություն չի թույլատրվում', 'Ատելության խոսք չի թույլատրվում',
            'Խաբեություն և վտանգավոր հղումներ չի թույլատրվում', 'Արգելվում է հաշիվներ կամ մետաղադրամներ վաճառել իրական գումարով', 'Ուրիշների IP հասցեներ չի թույլատրվում'],
    short: ['2 վայրկյանում ավելի քան 3 հաղորդագրություն։ 5-րդ անգամ՝ լռեցում։', 'Հաղորդագրությունը ջնջվում է, և դուք զգուշացում եք ստանում։', 'Նկարներ, հղումներ և տեքստ։',
            'Վիրավորանքներ և ինչ-որ մեկին իրեն վնասելու հորդորներ։', 'Ֆիշինգ, կեղծ Nitro, IP գողեր, .exe։ Միակ կանոնը, որի համար արգելափակում է լինում։',
            'Հաղորդագրությունը ջնջվում է, և դուք զգուշացում եք ստանում։', 'Հաղորդագրությունը ջնջվում է, առանց պատժի։'],
    notes: { flood: '2 վայրկյանում ավելի քան 3 հաղորդագրություն', invite: 'Հրավեր այլ սերվեր', 'nsfw-link': '18+ կայքի հղում', 'nsfw-image': '18+ նկար',
             slur: 'Վիրավորանք կամ ատելության խոսք', selfharm: 'Ինքնավնասման հորդոր', 'scam-text': 'Հայտնի խաբեբայական հաղորդագրություն', 'everyone-link': 'Զանգվածային նշում հղումով',
             badfile: 'Գործարկվող ֆայլ', scam: 'Խաբեբայական կամ ֆիշինգի հղում', grabber: 'IP հասցե գողացող հղում', cheat: 'Վաճառք իրական գումարով',
             custom: 'Այս սերվերում արգելված բառ', 'native-word': 'Արգելափակվել է սերվերի AutoMod կանոնով', warns: '3 զգուշացում 30 օրում' },
    units: { plural: 'none', min: ['րոպե'], hour: ['ժամ'], day: ['օր'] }
  },

  /* ---------- Azərbaycan ---------- */
  az: {
    name: 'Azərbaycan', locale: 'az',
    s: {
      warn: 'Xəbərdarlıq', mute: 'Səsi bağlandı', ban: 'Qadağan edildi', unmute: 'Səssizlik götürüldü', unban: 'Qadağa götürüldü', unwarn: 'Xəbərdarlıqlar silindi',
      removed: 'Mesaj silindi', rule: 'Qayda', reason: 'Səbəb', other: 'Digər', customWords: 'Bu serverdə qadağan olunmuş sözlər',
      nativeWord: 'Serverin AutoMod qaydası', noReason: 'Səbəb göstərilməyib', by: 'Verən: {who}', byBot: 'Avtomatik, bot tərəfindən', caseN: 'Hal {n}',
      ofLimit: '{n} / {limit}', forever: 'Həmişəlik', permanent: 'Daimi qadağa', nextMute: '30 gündə {limit} xəbərdarlıq olarsa: 1 saatlıq səssizlik.',
      escalated: 'Xəbərdarlıq {n} / {n}: {d} səssizlik. Hesablama yenidən başlayır.', escalatedBlocked: 'Xəbərdarlıq {n} / {n}. Hesablama yenidən başlayır.',
      tally: 'Say', untilLabel: 'Nə vaxtadək', lifts: 'Bitəcək', banWord: 'qadağa', status: 'Status', notApplied: 'Tətbiq olunmadı: {why}',
      ownerBlocked: 'server sahibini susdurmaq və ya qadağan etmək olmaz', adminBlocked: 'adminləri susdurmaq olmaz',
      failed: 'Alınmadı: botun icazəsi yoxdur', canTalk: 'Yenidən danışa bilər', backIn: 'Yenidən servere qoşula bilər', clean: 'Qeyd indi təmizdir',
      mistake: 'Botun səhv etdiyini düşünürsünüz? Sahibə yazın.', warnsAddShort: 'Xəbərdarlıqlar toplanır: 30 gündə üçüncüsü 1 saatlıq səssizlik deməkdir.',
      updated: 'Yeniləndi {d}', actNone: 'SİLİNDİ', actWarn: 'XƏBƏRDARLIQ', actMute: 'SƏSSİZLİK {d}', actBan: 'QADAĞA {d}',
      serversTitle: 'Serverlər', onlineN: '{n} onlayn', noRoomsNow: 'İndi heç bir otaq yoxdur. Oyna düyməsini basın, yeni otaq açılacaq.', stOpen: 'açıq', stFull: 'dolu',
      stFreeing: 'yer boşalır', phHiding: 'Gizlənmə', phHunt: 'Ov', phStory: 'Hekayə bitdi', leftT: '{t} qalıb', mapN: 'xəritə {m}',
      moreRooms: '+ daha {n} otaq', refresh: 'Yenilə', playNow: 'İndi oyna', gRaceMode: 'Yarış', gHnsMode: 'Gizlənpaç', playersN: '{n} oyunçu',
      playerN: '1 oyunçu', roomsN: '{n} otaq', roomN: '1 otaq', upTo40: 'hər birində 40 oyunçuya qədər',
      openProfile: 'Profili aç', tabProfile: 'Profil', tabMaps: 'Xəritələr', tabFriends: 'Dostlar', perToday: 'Bu gün', perWeek: 'Bu həftə', perAll: 'Bütün vaxt',
      joined: 'Qeydiyyat: {d}', coinsL: 'Sikkələr', raceScores: 'Yarış xalları', hsScores: 'Gizlənpaç xalları', noRank: 'rütbəsiz', aboutL: 'Haqqında',
      nothingWritten: 'Hələ heç nə yazılmayıb', todayWord: 'bu gün', weekWord: 'bu həftə', noMapsYet: 'Hələ dərc olunmuş xəritə yoxdur', noFriendsYet: 'Hələ dost yoxdur',
      published: 'Dərc olunub {d}', inGameTag: 'oyunda', likesN: 'bəyənən {a} · bəyənməyən {b}', onlineNowTag: 'indi onlayn', minAgo: '{n} dəq əvvəl',
      hAgo: '{n} saat əvvəl', dAgo: '{n} gün əvvəl', longAgo: 'çoxdan', friendsL: 'Dostlar', mapsL: 'Xəritələr', moreN2: '+ daha {n}', race: 'Yarış', hns: 'Gizlənpaç',
      rulesTitle: 'AIBROFIST serverinin qaydaları'
    },
    rules: ['Spam olmaz', 'Digər Discord serverlərinə dəvət olmaz', 'Böyüklər üçün məzmun olmaz', 'Nifrət nitqi olmaz', 'Fırıldaq və təhlükəli linklər olmaz',
            'Hesabların və ya sikkələrin real pula satışı qadağandır', 'Başqalarının IP ünvanları olmaz'],
    short: ['2 saniyədə 3-dən çox mesaj. 5-ci dəfə səssizlik.', 'Mesaj silinir və xəbərdarlıq alırsınız.', 'Şəkillər, linklər və mətn.',
            'Təhqirlər və kimisə özünə zərər verməyə çağırmaq.', 'Fişinq, saxta Nitro, IP oğruları, .exe. Qadağa verilən yeganə qayda.',
            'Mesaj silinir və xəbərdarlıq alırsınız.', 'Mesaj silinir, cəza yoxdur.'],
    notes: { flood: '2 saniyədə 3-dən çox mesaj', invite: 'Başqa servere dəvət', 'nsfw-link': '18+ saytın linki', 'nsfw-image': '18+ şəkil',
             slur: 'Təhqir və ya nifrət nitqi', selfharm: 'Özünə zərər verməyə çağırış', 'scam-text': 'Tanınmış fırıldaq mesajı', 'everyone-link': 'Linkli kütləvi qeyd',
             badfile: 'İcra olunan fayl', scam: 'Fırıldaq və ya fişinq linki', grabber: 'IP ünvanını oğurlayan link', cheat: 'Real pula satış',
             custom: 'Bu serverdə qadağan olunmuş söz', 'native-word': 'Serverin AutoMod qaydası ilə bloklandı', warns: '30 gündə 3 xəbərdarlıq' },
    units: { plural: 'none', min: ['dəqiqə'], hour: ['saat'], day: ['gün'] }
  },

  /* ---------- Қазақша ---------- */
  kk: {
    name: 'Қазақша', locale: 'kk',
    s: {
      warn: 'Ескерту', mute: 'Дыбысы өшірілді', ban: 'Бұғатталды', unmute: 'Үнсіздік алынды', unban: 'Бұғат алынды', unwarn: 'Ескертулер жойылды',
      removed: 'Хабарлама жойылды', rule: 'Ереже', reason: 'Себеп', other: 'Басқа', customWords: 'Бұл серверде тыйым салынған сөздер',
      nativeWord: 'Сервердің AutoMod ережесі', noReason: 'Себеп көрсетілмеген', by: 'Берген: {who}', byBot: 'Автоматты түрде, бот', caseN: 'Жағдай {n}',
      ofLimit: '{n} / {limit}', forever: 'Мәңгілікке', permanent: 'Тұрақты бұғат', nextMute: '30 күн ішінде {limit} ескерту болса: 1 сағатқа үнсіздік.',
      escalated: 'Ескерту {n} / {n}: {d} үнсіздік. Санау қайтадан басталады.', escalatedBlocked: 'Ескерту {n} / {n}. Санау қайтадан басталады.',
      tally: 'Санауыш', untilLabel: 'Дейін', lifts: 'Аяқталады', banWord: 'бұғат', status: 'Күйі', notApplied: 'Қолданылмады: {why}',
      ownerBlocked: 'сервер иесін үнсіз ету немесе бұғаттау мүмкін емес', adminBlocked: 'әкімшілерді үнсіз ету мүмкін емес',
      failed: 'Сәтсіз: боттың рұқсаты жоқ', canTalk: 'Қайтадан сөйлей алады', backIn: 'Серверге қайта қосыла алады', clean: 'Жазба енді таза',
      mistake: 'Бот қателесті деп ойлайсыз ба? Иесіне жазыңыз.', warnsAddShort: 'Ескертулер қосылады: 30 күн ішінде үшіншісі 1 сағат үнсіздік дегенді білдіреді.',
      updated: 'Жаңартылды {d}', actNone: 'ЖОЙЫЛДЫ', actWarn: 'ЕСКЕРТУ', actMute: 'ҮНСІЗДІК {d}', actBan: 'БҰҒАТ {d}',
      serversTitle: 'Серверлер', onlineN: '{n} онлайн', noRoomsNow: 'Қазір бөлмелер жоқ. «Ойнау» түймесін басыңыз, жаңа бөлме ашылады.', stOpen: 'ашық', stFull: 'толы',
      stFreeing: 'орын босап жатыр', phHiding: 'Жасырыну', phHunt: 'Аң аулау', phStory: 'Оқиға аяқталды', leftT: '{t} қалды', mapN: 'карта {m}',
      moreRooms: '+ тағы {n} бөлме', refresh: 'Жаңарту', playNow: 'Қазір ойнау', gRaceMode: 'Жарыс', gHnsMode: 'Жасырынбақ', playersN: '{n} ойыншы',
      playerN: '1 ойыншы', roomsN: '{n} бөлме', roomN: '1 бөлме', upTo40: 'әрқайсысында 40 ойыншыға дейін',
      openProfile: 'Профильді ашу', tabProfile: 'Профиль', tabMaps: 'Карталар', tabFriends: 'Достар', perToday: 'Бүгін', perWeek: 'Осы апта', perAll: 'Барлық уақыт',
      joined: 'Тіркелген күні: {d}', coinsL: 'Монеталар', raceScores: 'Жарыс ұпайлары', hsScores: 'Жасырынбақ ұпайлары', noRank: 'разрядсыз', aboutL: 'Өзім туралы',
      nothingWritten: 'Әзірге ештеңе жазылмаған', todayWord: 'бүгін', weekWord: 'осы апта', noMapsYet: 'Әзірге жарияланған карталар жоқ', noFriendsYet: 'Әзірге достар жоқ',
      published: 'Жарияланған күні: {d}', inGameTag: 'ойында', likesN: 'ұнайды {a} · ұнамайды {b}', onlineNowTag: 'қазір онлайн', minAgo: '{n} мин бұрын',
      hAgo: '{n} сағ бұрын', dAgo: '{n} күн бұрын', longAgo: 'баяғыда', friendsL: 'Достар', mapsL: 'Карталар', moreN2: '+ тағы {n}', race: 'Жарыс', hns: 'Жасырынбақ',
      rulesTitle: 'AIBROFIST сервер ережелері'
    },
    rules: ['Спам болмайды', 'Басқа Discord серверлеріне шақырулар болмайды', 'Ересектерге арналған контент болмайды', 'Өшпенділік сөздері болмайды',
            'Алаяқтық және қауіпті сілтемелер болмайды', 'Аккаунттарды немесе монеталарды нақты ақшаға сатуға тыйым салынады', 'Басқалардың IP мекенжайлары болмайды'],
    short: ['2 секундта 3-тен көп хабарлама. 5-ші рет үнсіздік.', 'Хабарлама жойылады, сізге ескерту беріледі.', 'Суреттер, сілтемелер және мәтін.',
            'Қорлау және біреуді өзіне зиян келтіруге үгіттеу.', 'Фишинг, жалған Nitro, IP ұрлаушылар, .exe. Бұғат берілетін жалғыз ереже.',
            'Хабарлама жойылады, сізге ескерту беріледі.', 'Хабарлама жойылады, жаза жоқ.'],
    notes: { flood: '2 секундта 3-тен көп хабарлама', invite: 'Басқа серверге шақыру', 'nsfw-link': '18+ сайтқа сілтеме', 'nsfw-image': '18+ сурет',
             slur: 'Қорлау немесе өшпенділік сөзі', selfharm: 'Өзіне зиян келтіруге үгіттеу', 'scam-text': 'Белгілі алаяқтық хабарлама', 'everyone-link': 'Сілтемесі бар жаппай аталым',
             badfile: 'Орындалатын файл', scam: 'Алаяқтық немесе фишинг сілтемесі', grabber: 'IP мекенжайын ұрлайтын сілтеме', cheat: 'Нақты ақшаға сату',
             custom: 'Бұл серверде тыйым салынған сөз', 'native-word': 'Сервердің AutoMod ережесімен бұғатталды', warns: '30 күн ішінде 3 ескерту' },
    units: { plural: 'none', min: ['минут'], hour: ['сағат'], day: ['күн'] }
  },

  /* ---------- Afrikaans ---------- */
  af: {
    name: 'Afrikaans', locale: 'af',
    s: {
      warn: 'Waarskuwing', mute: 'Gedemp', ban: 'Verban', unmute: 'Demping opgehef', unban: 'Verbod opgehef', unwarn: 'Waarskuwings verwyder',
      removed: 'Boodskap verwyder', rule: 'Reël', reason: 'Rede', other: 'Ander', customWords: 'Woorde wat op hierdie bediener verbode is',
      nativeWord: 'Bediener se AutoMod-reël', noReason: 'Geen rede gegee nie', by: 'Uitgereik deur {who}', byBot: 'Outomaties, deur die bot', caseN: 'Saak {n}',
      ofLimit: '{n} van {limit}', forever: 'Vir ewig', permanent: 'Permanente verbod', nextMute: 'By {limit} waarskuwings binne 30 dae: demping vir 1 uur.',
      escalated: 'Waarskuwing {n} van {n}: gedemp vir {d}. Die telling begin weer van voor af.', escalatedBlocked: 'Waarskuwing {n} van {n}. Die telling begin weer van voor af.',
      tally: 'Telling', untilLabel: 'Tot', lifts: 'Eindig', banWord: 'verbod', status: 'Status', notApplied: 'Nie toegepas nie: {why}',
      ownerBlocked: 'die bedienereienaar kan nie gedemp of verban word nie', adminBlocked: 'administrateurs kan nie gedemp word nie',
      failed: 'Misluk: die bot het nie toestemming nie', canTalk: 'Kan weer praat', backIn: 'Kan weer by die bediener aansluit', clean: 'Rekord is nou skoon',
      mistake: 'Dink die bot het ’n fout gemaak? Stuur vir die eienaar ’n boodskap.', warnsAddShort: 'Waarskuwings tel op: die 3de binne 30 dae beteken 1 uur demping.',
      updated: 'Opgedateer {d}', actNone: 'VERWYDER', actWarn: 'WAARSKUWING', actMute: 'DEMPING {d}', actBan: 'VERBOD {d}',
      serversTitle: 'Bedieners', onlineN: '{n} aanlyn', noRoomsNow: 'Geen kamers nou nie. Druk Speel en ’n nuwe kamer sal oopmaak.', stOpen: 'oop', stFull: 'vol',
      stFreeing: 'daar maak ’n plek oop', phHiding: 'Wegkruip', phHunt: 'Jag', phStory: 'Storie is verby', leftT: '{t} oor', mapN: 'kaart {m}',
      moreRooms: '+ nog {n} kamers', refresh: 'Verfris', playNow: 'Speel nou', gRaceMode: 'Wedloop', gHnsMode: 'Wegkruipertjie', playersN: '{n} spelers',
      playerN: '1 speler', roomsN: '{n} kamers', roomN: '1 kamer', upTo40: 'tot 40 spelers in elk',
      openProfile: 'Maak profiel oop', tabProfile: 'Profiel', tabMaps: 'Kaarte', tabFriends: 'Vriende', perToday: 'Vandag', perWeek: 'Hierdie week', perAll: 'Alle tyd',
      joined: 'Aangesluit {d}', coinsL: 'Munte', raceScores: 'Wedloopkolle', hsScores: 'Wegkruipertjie-punte', noRank: 'geen rang', aboutL: 'Oor my',
      nothingWritten: 'Nog niks geskryf nie', todayWord: 'vandag', weekWord: 'hierdie week', noMapsYet: 'Nog geen kaarte gepubliseer nie', noFriendsYet: 'Nog geen vriende nie',
      published: 'Gepubliseer {d}', inGameTag: 'in die spel', likesN: 'hou van {a} · hou nie van {b}', onlineNowTag: 'nou aanlyn', minAgo: '{n} min gelede',
      hAgo: '{n} h gelede', dAgo: '{n} dae gelede', longAgo: 'lank gelede', friendsL: 'Vriende', mapsL: 'Kaarte', moreN2: '+ nog {n}', race: 'Wedloop', hns: 'Wegkruipertjie',
      rulesTitle: 'AIBROFIST-bedienerreëls'
    },
    rules: ['Geen strooipos nie', 'Geen uitnodigings na ander Discord-bedieners nie', 'Geen inhoud vir volwassenes nie', 'Geen haatspraak nie', 'Geen swendelary of gevaarlike skakels nie',
            'Dit is verbode om rekeninge of munte vir regte geld te verkoop', 'Geen ander mense se IP-adresse nie'],
    short: ['Meer as 3 boodskappe in 2 sekondes. Demping by die 5de keer.', 'Die boodskap word verwyder en jy kry ’n waarskuwing.', 'Beelde, skakels en teks.',
            'Beledigings, en om iemand aan te spoor om hulself seer te maak.', 'Uitvissing, vals Nitro, IP-diewe, .exe. Die enigste reël met ’n verbod.',
            'Die boodskap word verwyder en jy kry ’n waarskuwing.', 'Die boodskap word verwyder, geen straf nie.'],
    notes: { flood: 'Meer as 3 boodskappe in 2 sekondes', invite: 'Uitnodiging na ’n ander bediener', 'nsfw-link': 'Skakel na ’n 18+-werf', 'nsfw-image': '18+-beeld',
             slur: 'Belediging of haatspraak', selfharm: 'Aansporing tot selfbeskadiging', 'scam-text': 'Bekende swendelboodskap', 'everyone-link': 'Massa-vermelding met skakel',
             badfile: 'Uitvoerbare lêer', scam: 'Swendel- of uitvissingskakel', grabber: 'Skakel wat ’n IP-adres steel', cheat: 'Verkoop vir regte geld',
             custom: 'Woord wat op hierdie bediener verbode is', 'native-word': 'Geblokkeer deur die bediener se AutoMod-reël', warns: '3 waarskuwings binne 30 dae' },
    units: { plural: 'one', min: ['minuut', 'minute'], hour: ['uur', 'ure'], day: ['dag', 'dae'] }
  }
};

module.exports = { PACKS };
