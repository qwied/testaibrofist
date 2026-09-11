/* AIBROFIST — интерфейс только на английском.
   Раньше здесь жил переключатель на 10 языков (сохранялся в аккаунт и
   в браузер); по просьбе владельца его убрали — сайт всегда на
   английском, кроме чата, где игроки пишут как хотят. Словарь ниже
   остался нужен: часть разметки ещё содержит русский текст как
   запасной вариант (data-i18n/data-i18n-title), и без замены на
   английский при загрузке страницы он мелькнул бы до её собственного
   кода. */
(function () {
  'use strict';

  var D = {
    /* ---------- шапка и навигация ---------- */
    leaderboard: "Leaderboard",
    editor: "Editor",
    browser: "Browser",
    mapEditor: "Map Editor",
    skinEditor: "Skin Editor",
    mapsBrowser: "Maps Browser",
    skinsBrowser: "Skins Browser",
    avatar: "Avatar",
    shop: "Shop",
    logs: "Logs",
    menu: "Menu",
    moreOptions: "More",
    messages: "Messages",
    supporters: "Supporters",
    tutorial: "Editor Tutorial",
    privacy: "Privacy Policy",
    terms: "Terms & Conditions",
    settings: "Settings",
    viewProfile: "View profile",
    logout: "Log out",
    signin: "Sign in",

    /* ---------- режимы ---------- */
    hideAndSeek: "Hide and Seek",
    race: "Race",

    /* ---------- вход ---------- */
    signInOrUp: "Sign in or sign up",
    loginAcc: "Log in",
    createAcc: "Create account",
    phLogin: "Username",
    phPass: "Password",
    enterLogin: "Enter a username",
    enterPass: "Enter a password",
    checking: "Checking…",
    creating: "Creating…",

    /* ---------- редактор скинов ---------- */
    skinTitle: "Skin Editor",
    slotColor: "Colour",
    slotHead: "Head",
    slotFace: "Face",
    slotBody: "Body",
    slotBack: "Back",
    buy: "Buy",
    equip: "Equip",
    equipped: "Equipped",
    ownedTxt: "Owned",
    free: "Free",
    coins: "Coins",
    notEnough: "Not enough coins",
    saved: "Saved",
    save: "Save",
    randomize: "Randomize",
    resetAll: "Reset",
    shopTab: "Shop",
    myTab: "My items",
    preview: "Preview",

    skinSub: "Draw accessories for your character — the body color is set by the game.",
    skinsSub: "Player-made skins. Rate the ones you like — the owner picks the best for Avatar.",
    avatarSub: "Buy skins picked by the owner from Skins Browser. Want to make your own? Skin Editor is free.",
    skinBodyHint: "The greyed-out silhouette is fixed — draw hats, masks and other extras around it.",
    skinMirrorHint: "Left/right mirror is on by default — turn it off with the ⇋ button.",
    skinCustomColor: "Custom color",
    skinWear: "Wear it",
    skinClear: "Clear canvas",
    skinResetToDefault: "Reset to default look",
    skinsLeft: "Slots left in Skins Browser",
    skinEmpty: "Draw something first",
    skinToolBrush: "Brush",
    skinToolEyedrop: "Eyedropper",
    skinToolFill: "Fill bucket",
    skinToolEraser: "Eraser",
    skinToolMirror: "Mirror left/right",
    openSkinEditor: "Open Skin Editor (free)",
    openSkinsBrowser2: "Open Skins Browser",
    tabWear: "Outfits",
    tabLooks: "Ready skins",
    tabMine: "My skins",
    saveToMine: "Save to My skins",
    shopEmpty: "No ready skins yet.",
    mineGuest: "Sign in to save your looks.",
    skinPlain: "No accessories",
    skinImage: "Picture skin",
    mineEmpty: "Nothing here yet. Dress up and press “Save to My skins”.",
    openAvatar: "Open Avatar",
    publishSkin: "Publish to Skins Browser",
    minePlaces: "Free slots in My skins",
    skinNameAsk: "Skin name (2–30 characters):",
    skinNameShort: "Name is too short",
    openSkinsBrowser: "Open the Skins Browser?",
    noSkins: "No skins found",
    tryOn: "Try on",
    wornOk: "Skin equipped",
    toAvatar: "To Avatar",
    removeAvatar: "Remove from Avatar",
    priceCoins: "Price in coins",
    avatarEmpty: "The owner hasn’t added any skins for sale yet — check Skins Browser.",
    skinBy: "Skin",
    ownSkin: "Your own look",
    bought: "Purchased",

    changePass: "Change password",
    curPass: "Current password",
    newPass: "New password (4+ characters)",
    logoutAll: "Log out everywhere",
    secNote: "Your password is stored hashed — even the admin cannot see it.",
    fillBoth: "Fill in both fields",

    addFromUrl: "From URL",
    addFromFile: "From file",
    setImage: "Set image",
    changeImage: "Change image",
    imageAsk: "Image URL (empty to remove):",
    needUrl: "Paste an image URL",
    imgTooBig: "Image is too heavy even after compression",
    imgBad: "Could not read the image",

    lightTheme: "Light",
    darkTheme: "Dark",
    modeFree: "Light and dark unlock once for 100 coins.",
    themes: "Themes",
    themesSub: "Light and dark look for the site.",
    yourColors: "Your colours",
    allColors: "All colours",
    readySets: "Ready-made sets",
    pickerHint: "Tap a colour square above to pick any shade you like.",
    slotsHint: "Colours picked: ",
    pickFirst: "Nothing picked yet — tap a colour below.",
    themesLocked: "Themes are still locked",
    themesWhat: "Unlocks the light and dark look across the whole site: header, buttons, cards, lists. One-time purchase, switch as often as you like afterwards.",
    unlockThemes: "Unlock themes",
    defaultTheme: "Back to the default look",

    /* ---------- язык ---------- */
    language: "Language",
    langAuto: "Automatic (by country)",
    langHint: "The interface is translated automatically by country. You can pick a language manually.",

    /* ---------- обзор карт ---------- */
    colName: "Name",
    colRating: "Rating",
    colAuthor: "Author",
    colDate: "Date",
    play: "PLAY",
    refresh: "Refresh",
    noMaps: "No maps found",
    sortDate: "Sort by date",
    sortRating: "Sort by rating",
    modeAll: "Mode: All",

    mapsSub: "Player maps. Open them, play and rate.",
    removeFriend: "Remove friend",
    cancelReq: "Cancel request",
    noAbout: "Nothing written yet",
    emptyHere: "Empty",
    nobodyFound: "Nobody found",
    noUser: "No player specified",
    nowOnline: "online now",
    minAgo: "min ago",
    hoursAgo: "h ago",
    daysAgo: "d ago",
    deleted: "Map deleted",
    confirmDel: "Delete for sure?",

    /* ---------- инструменты владельца ---------- */
    ownerTools: "Owner tools",
    addToGame: "Add to game",
    inGameTxt: "In game",
    removeGame: "Remove from game",
    boostVotes: "Set votes",
    likes: "Likes",
    dislikes: "Dislikes",
    apply: "Apply",
    giveCoins: "Give coins",
    amount: "Amount",
    playerName: "Player name",
    onlyOwner: "Owner only",

    /* ---------- редактор карт ---------- */
    coinLimit: "A map can hold at most 3 coins",
    publishMap: "Publish to Maps Browser",

    joinDate: "Join Date",
    accept: "Accept",
    decline: "Decline",
    find: "Find",
    exactSearch: "Exact search",
    searchUsers: "Search users",
    addFriend: "Add friend",
    report: "Report",
    editTxt: "Edit",
    removeTxt: "Remove",
    friendsTxt: "Friends",
    requestsTxt: "Requests",
    pendingTxt: "Pending",
    mapsTxt: "Maps",
    skinsTxt: "Skins",

    /* ---------- игровой экран ---------- */
    gPlayers: "Players",
    gPing: "Ping",
    gPingMs: "ms",
    gTimeLbl: "Time",
    roleLbl: "Role",
    roleSeeker: "Seeker",
    roleHider: "Hider",
    noMapsYet: "No maps yet",
    publishHint: "Publish a map in the Map Editor",
    emptyTitle: "Nothing here yet",
    emptyText: "Nobody has published a map for this mode yet. Open the Map Editor and add yours.",
    mapBy: "by ",
    brokenMap: "map is corrupted",
    waitText: "Roles will be picked in 30 seconds.",
    dupTitle: "Account already in game",
    dupText: "This account is already open in another tab or device. Close it and refresh this page.",
    roundStart: "Round started! 2 minutes",
    roundOver: "Round over",
    newMapText: "New map. Starting in 30 seconds.",
    timeUp: "Time's up — next map",
    allCaughtT: "Everyone caught — round over!",
    roulTitle: "Choosing the seeker",
    roulSeekerIs: "Seeker: ",
    roulSpin: "Who is seeking this round?",
    roulYouSeek: "You are the seeker!",
    chanceLbl: "Your chance",
    chatBtn: "Chat",
    soundBtn: "Sound",

    messagesTitle: "Messages",
    messagesSub: "Private chats with other players. Add 2 or more names to start a secret group chat.",
    msNewChat: "New chat",
    msPick: "Pick a chat on the left, or start a new one.",
    msNone: "No chats yet.",
    msNewAsk: "Player name(s), comma-separated for a group chat:",
    msSend: "Send",
    msTypeHint: "Message",
    msgBtn: "Message",
    allCaughtC: "Everyone caught",
    allFinished: "Everyone finished — new map!",
    finishSolo: "Finish! New map",
    mapLog: "Map: ",
    byWord: " by ",
    coinsGain: "+{n} coins ({t} in total)",
    ratingLbl: "rating: ",

    /* ---------- редактор скинов: рисование ---------- */
    drawZone: "Drawing zone",
    drawHint: "Tap the head or the body on the figure — only the picked zone can be edited.",
    brush: "Brush",
    eraser: "Eraser",
    undoTxt: "Undo",
    nothingUndo: "Nothing to undo",
    clearZone: "Clear zone",
    clearAll: "Clear all",
    brushSize: "Brush size",
    anyColor: "Custom colour",
    toolLbl: "Tool",
    imgModeTxt: "A ready-made image skin is worn right now.",
    drawAgain: "Draw",
    alreadyOn: "This skin is already saved and worn",
    publishDrawnOnly: "Only a skin drawn here can be published",

    /* ---------- общее ---------- */
    close: "Close",
    back: "Back",
    cancel: "Cancel",
    loading: "Loading…",
    errorTxt: "Error",
    serverDown: "Server unavailable",
    loginFirst: "Log in first",
    guest: "Guest",
    notReady: "This section is not ready yet",

    /* ---------- страницы режимов ---------- */
    modeHsText: "Before each round a roulette spins on screen: player cards with skins and names, and a grey striped highlight picks the seeker. The odds change every round, and recent seekers get a smaller chance. While everyone hides, the seeker sees no one — and is seen by no one.",
    hsRule1: "The roulette picks the seeker at the start of each round — the odds are new every time.",
    hsRule2: "While everyone hides, the seeker cannot see the hiders, and the hiders cannot see the seeker.",
    hsRule3: "Once the round starts everyone sees everyone — the hunt begins.",
    hsRule4: "A caught player changes colour and helps seek the rest.",
    hsRule5: "The server picks the map from the ones the developer added.",
    hsRule6: "A good hiding spot is not the farthest, but the least obvious.",
    modeRaceText: "Everyone starts at once and runs for the finish. The first to touch the flag wins — but the way there is rarely straight.",
    raceRule1: "Spikes and poison send you back to the last checkpoint, not the start.",
    raceRule2: "Trampolines throw you higher than a regular jump reaches.",
    raceRule3: "Platforms and rotators move — sometimes it pays to wait.",
    raceRule4: "Reaching the finish pays 1-5 coins at random, every time.",
    raceRule5: "Your lap time is on screen — beat your own record on the same map.",
    mdBack: "Back to main",

    /* ---------- новости, лидеры, прочее ---------- */
    logsSub: "AIBrofist updates and announcements",
    addImages: "Add images",
    dropHint: "drag files here or paste from clipboard (Ctrl+V) — up to 8",
    publishBtn: "Publish",
    noNewsYet: "No news yet",
    loadFailed: "Failed to load",
    delNewsAsk: "Delete this post?",
    kbUnit: " KB",
    kbLoaded: "uploaded",
    lbSub: "Top 10 by coins collected · updates automatically",
    lbEmpty: "Nobody has collected any coins yet",
    signForCoins: "Sign in so your coins are saved",
    joinedWord: " joined",
    leftWord: " left",
    ownerFab: "Edit",
    phTitle: "Title",
    phNewsText: "Post text",
    lbPlaceN: "You are #{n} · {t} coins",
    lbYouHave: "You have {t} coins",

    /* ---------- каталог скинов: названия деталей (голова/тело) ---------- */
    skin_h_none: "None",
    skin_b_none: "None",
    skin_h_wizard: "Stargazer Hood",
    skin_h_viking: "Horned Helmet",
    skin_h_king: "Golden Crown",
    skin_h_pharaoh: "Pharaoh's Garb",
    skin_h_dots: "Polka Dot Bow",
    skin_h_phoenix: "Phoenix Head",
    skin_h_lepre: "Leprechaun Top Hat",
    skin_h_skater: "Shaggy Hair & Glasses",
    skin_h_artist: "Artist's Beret",
    skin_h_emerald: "Green Hat",
    skin_h_candle: "Candle Light",
    skin_h_paint: "Paint Strokes",
    skin_h_shade: "Horned Shadow",
    skin_h_smile: "Glasses Smiley",
    skin_h_green_pl: "Green Cap",
    skin_h_lady: "Hat with Flowers",
    skin_h_bunnyhd: "Bunny Hood",
    skin_h_red_pl: "Red Cap",
    skin_h_deer: "Eye with Horns",
    skin_h_skier: "Ski Mask",
    skin_h_crimson: "Crimson Head",
    skin_h_frost: "Ice Guard Helmet",
    skin_h_totem: "Wooden Totem",
    skin_h_azure: "Azure Beast Head",
    skin_h_nomad: "Red Headband",
    skin_h_elkwar: "Horned Helmet",
    skin_h_chief: "Chief's Mask",
    skin_h_owl: "Owl Face",
    skin_h_furry: "Shaggy Mask",
    skin_h_moth1: "Moth Head",
    skin_h_rabbit: "Rabbit Face",
    skin_h_puppy: "Doggie Muzzle",
    skin_h_catninja: "Cat Ninja Helmet",
    skin_h_reaper: "White Reaper Mask",
    skin_h_moth2: "Moth Tendrils",
    skin_h_bluewolf: "Blue Wolf Head",
    skin_h_raven: "Raven Face",
    skin_h_sailor: "Red Bandana",
    skin_h_pirate: "Pirate Tricorn",
    skin_h_bonedrag: "Dragon Skull",
    skin_h_prince: "Golden Tiara",
    skin_h_clown: "Clown Wig",
    skin_h_vampire: "Black Top Hat",
    skin_h_priest: "Priest's Wreath",
    skin_h_forest: "Crimson Crown",
    skin_h_glitch: "Glitch Head",
    skin_h_sunset: "Orange Balloon",
    skin_h_popit: "Rainbow Pop-It",
    skin_h_toxic: "Radiation Sign",
    skin_h_nerd: "Nerdy Smiley",
    skin_h_shards: "Glass Shards",
    skin_h_aqua: "Aquarium Cover",
    skin_h_wire: "Head Frame",
    skin_h_dashed: "Dotted Head",
    skin_h_pastel: "Pastel Flowers",
    skin_h_fox: "Fox Face",
    skin_h_slasher: "Hockey Mask",
    skin_h_beach: "Straw Crown",
    skin_h_cat: "Cat Face",
    skin_h_zombie: "Zombie Head",
    skin_h_mummy: "Head Bandages",
    skin_h_crest_r: "Crimson Coat of Arms",
    skin_h_crest_f: "Fire Coat of Arms",
    skin_h_check: "Green Checkmark",
    skin_b_wizard: "Star Mantle",
    skin_b_viking: "War Axe",
    skin_b_king: "Royal Mantle",
    skin_b_pharaoh: "Pharaoh's Belt",
    skin_b_dots: "Polka Dot Handbag",
    skin_b_phoenix: "Fiery Plumage",
    skin_b_lepre: "Leprechaun Costume",
    skin_b_skater: "White Hoodie",
    skin_b_artist: "Blue Vest",
    skin_b_emerald: "Emerald Tuxedo",
    skin_b_baker: "Baker's Apron",
    skin_b_candle: "Wax Candle",
    skin_b_paint: "Painter's Canvas",
    skin_b_shade: "Shadow Rags",
    skin_b_smile: "Yellow Body",
    skin_b_green_pl: "Green Jumpsuit",
    skin_b_lady: "Yellow Dress",
    skin_b_bunnyhd: "Carrot Behind Your Back",
    skin_b_red_pl: "Blue Jumpsuit",
    skin_b_deer: "White Mane",
    skin_b_skier: "Red Collar",
    skin_b_crimson: "Crimson Body",
    skin_b_frost: "Ice Guard Armor",
    skin_b_totem: "Totem Armor",
    skin_b_azure: "Azure Beast Hide",
    skin_b_nomad: "Fur Cloak",
    skin_b_elkwar: "Fur Armor",
    skin_b_chief: "Crimson Armor",
    skin_b_owl: "Owl Wings",
    skin_b_furry: "Shaggy Fur Coat",
    skin_b_moth1: "Moth Wings",
    skin_b_catninja: "Blue and White Kimono",
    skin_b_reaper: "White Cloak",
    skin_b_moth2: "Emperor's Wings",
    skin_b_bluewolf: "Blue Wolf Skin",
    skin_b_raven: "Raven's Feathers",
    skin_b_sailor: "Striped Shirt",
    skin_b_pirate: "Pirate Caftan",
    skin_b_bonedrag: "Dragon Cloak",
    skin_b_judo: "White Kimono",
    skin_b_prince: "Parade Uniform",
    skin_b_clown: "Clown Costume",
    skin_b_vampire: "Burgundy Cloak",
    skin_b_priest: "White Toga",
    skin_b_forest: "Green Cape",
    skin_b_glitch: "Glitch Body",
    skin_b_sunset: "Sunset Gradient",
    skin_b_popit: "Pop-It Body",
    skin_b_toxic: "Toxic Body",
    skin_b_nerd: "Body with a Book",
    skin_b_shards: "Stained Glass",
    skin_b_aqua: "Fish Tank",
    skin_b_wire: "Body Frame",
    skin_b_dashed: "Dotted Body",
    skin_b_pastel: "Pastel Dress",
    skin_b_fox: "Fox Paws",
    skin_b_slasher: "Machete",
    skin_b_beach: "Beach Body",
    skin_b_cat: "Cat Body",
    skin_b_zombie: "Ripped Body",
    skin_b_mummy: "Body Bandages",
    skin_b_crest_r: "Crimson Armor",
    skin_b_crest_f: "Smoldering Armor",
    skin_b_check: "Green Body",

    /* ---------- редактор карт: интерфейс инструмента ---------- */
    edProps: "Properties",
    edExit: "Exit",
    edExitTip: "exit game (Esc)",
    hudDeathLabel: "Deaths",
    edTimeTip: "run time",
    edObjTip: "objects on the map (max 2000)",
    edDeathTip: "deaths",
    ok: "OK",
    toolSelect: "Select",
    toolHand: "Hand (move map)",
    toolBlock: "Block",
    toolCircle: "Circle",
    toolTriangle: "Triangle",
    toolText: "Text",
    toolSpawn: "Start point",
    toolButton: "Button",
    toolLever: "Lever",
    toolCheckpoint: "Checkpoint",
    toolFinish: "Finish",
    btnSaveTip: "Save .txt",
    btnOpenTip: "Open",
    btnJsonTip: "Export JSON",
    btnUndoTip: "Undo (Ctrl+Z)",
    btnRedoTip: "Redo (Ctrl+Y)",
    btnCopyTip: "Duplicate (Ctrl+D)",
    btnDelTip: "Delete (Del)",
    btnGridTip: "Grid (G)",
    btnPlayTip: "Play",
    objLimitTitle: "Limit: {n} objects",
    objLimitBody: "The map already has {n}. Remove something to add a new one.",
    noSpawnTitle: "No start point",
    noSpawnBody: "Place the \"Start point\" tool, then press ▶.",
    spawnCloseTitle: "Start is too close to the finish",
    spawnCloseBody: "There are {n} points between them, need at least {m}. Move the start or finish.",
    spawnClosePublishBody: "There are {n} points between them. Move the start or finish and try again.",
    finishTitle: "FINISH!",
    finishBody: "Time {t}s · deaths {d}   —   new run starting shortly",
    droppedObjsTitle: "Removed objects: {n}",
    droppedObjsBody: "They don't work in \"{mode}\" mode. Ctrl+Z will bring them back.",
    copiedTitle: "Copied",
    copiedBody: "Ctrl+V will place a copy under the cursor",
    linkHelpClosed: "How to link? ▾",
    linkHelpOpen: "How to link? ▴",
    linkHelpBody: "1. Give the <b>target shape</b> an <b>ID</b> — e.g. <code>g1</code>.<br>2. On the <b>Button</b> or <b>Lever</b>, put the same <code>g1</code> in the <b>Targets</b> field.<br>3. Press ▶ — the block opens from the button.<br><br>You can list several targets separated by commas: <code>g1,g2</code>.<br>The button holds while stood on. The lever toggles permanently.",
    lblWidth: "Width",
    lblHeight: "Height",
    lblRotation: "Rotation",
    lblSize: "Size",
    lblColor: "Color",
    grpGameProps: "Game properties",
    chkDeadly: "Poison (kills)",
    chkGhost: "Passable (decoration)",
    chkHideSpot: "Hiding spot",
    chkRicochet: "Ricochet",
    lblBouncePower: "Bounce power",
    chkPushable: "Pushable",
    lblMass: "Mass",
    chkMoves: "Moves",
    lblMoveX: "Move X",
    lblMoveY: "Move Y",
    lblSpeed: "Speed",
    chkSpins: "Rotates",
    lblSpinSpeed: "Rotation speed",
    grpLinks: "Links",
    lblTargets: "Targets",
    chkStartsOpen: "Starts open (passable)",
    grpOrder: "Order",
    zBack: "Send back",
    zFront: "Bring front",
    accessDeniedTitle: "Access denied",
    accessDeniedFileBody: "The file isn't signed by this editor.",
    accessDeniedKeyBody: "The map key doesn't match. Developer only.",
    readErrorBody: "Couldn't read the map file.",
    mapNotFoundTitle: "Map not found",
    mapNotFoundBody: "Couldn't load \"{name}\".",
    editLoadServerDownBody: "Couldn't load the map for editing.",
    publishBtnTip: "Publish to Maps Browser",
    publishBtnLabel: "Publish",
    tooManyObjectsTitle: "Too many objects",
    tooManyObjectsBody: "The map has {n}. Allowed no more than {lim}.",
    wrongModeObjTitle: "Objects not for this mode",
    wrongModeObjBody: "Don't work in \"{mode}\" mode: {list}",
    publishCollectFailTitle: "Couldn't build the map",
    publishSuccessTitle: "Map published",
    publishExistsTitle: "Map already exists",
    publishFailedTitle: "Failed",
    publishServerDownBody: "Couldn't reach the server.",
    publishAskTitle: "Publish map",
    publishNamePrompt: "Map name (2–30 characters):",
    nameTooShortTitle: "Name too short",
    nameTooShortBody: "Need at least 2 characters.",
    edHomeTitle: "Home",
  };

  /* строки, которые рисуют чужие бандлы — ловим по тексту */
  var AUTO = {
    'Leaderboard': 'leaderboard', 'Leaderboards': 'leaderboard',
    'Editor': 'editor', 'Browser': 'browser', 'Menu': 'menu',
    'Map Editor': 'mapEditor', 'Skin Editor': 'skinEditor',
    'Maps Browser': 'mapsBrowser', 'Skins Browser': 'skinsBrowser',
    'Avatar': 'avatar', 'Shop': 'shop', 'Logs': 'logs',
    'Supporters': 'supporters', 'Editor Tutorial': 'tutorial',
    'Privacy Policy': 'privacy', 'Terms & Conditions': 'terms',
    'View profile': 'viewProfile', 'Settings': 'settings', 'Log out': 'logout',
    'Sign in': 'signin', 'Sign In or Sign Up': 'signInOrUp',
    'Name': 'colName', 'Rating': 'colRating', 'Author': 'colAuthor', 'Date': 'colDate',
    'PLAY': 'play', 'Refresh': 'refresh', 'No maps found': 'noMaps',
    'Sort by date': 'sortDate', 'Sort by rating': 'sortRating', 'Mode: All': 'modeAll',
    'Play': 'play', 'Mode: All': 'modeAll', 'Sort by rating': 'sortRating',
    'Sort by date': 'sortDate', 'Refresh': 'refresh', 'Author': 'colAuthor',
    'Name': 'colName', 'Rating': 'colRating', 'Date': 'colDate',
    'Hide And Seek': 'hideAndSeek',
    'Join Date': 'joinDate', 'Add friend': 'addFriend', 'Remove': 'removeTxt',
    'Accept': 'accept', 'Decline': 'decline', 'Cancel': 'cancel',
    'Equip': 'equip', 'Equipped': 'equipped', 'Free': 'free', 'Buy': 'buy',
    'Try on': 'tryOn', 'Save': 'save', 'Reset': 'resetAll', 'Randomise': 'randomize',
    'Head': 'slotHead', 'Face': 'slotFace', 'Body': 'slotBody', 'Back': 'slotBack',
    'Shop': 'shop', 'My items': 'myTab', 'Preview': 'preview',
    'Save to My skins': 'saveToMine',
    'Themes': 'themes', 'Темы': 'themes',
    'Author Name': 'colAuthor', 'Skin Name': 'colName',
    'Search users': 'searchUsers', 'Add friend': 'addFriend', 'Report': 'report',
    'Edit': 'editTxt', 'Remove': 'removeTxt', 'Friends': 'friendsTxt',
    'Requests': 'requestsTxt', 'Pending': 'pendingTxt', 'Maps': 'mapsTxt', 'Skins': 'skinsTxt',
    'Mode: Hide And Seek': 'hideAndSeek', 'Mode: Race': 'race',
    'Hide and Seek': 'hideAndSeek', 'Race': 'race',
    'Таблица лидеров': 'leaderboard', 'Новости': 'logs', 'Настройки': 'settings',
    'Мой профиль': 'viewProfile', 'Выйти': 'logout', 'Войти': 'signin',
    'Вход или регистрация': 'signInOrUp', 'Войти в аккаунт': 'loginAcc',
    'Создать аккаунт': 'createAcc', 'Гость': 'guest', 'Загрузка…': 'loading'
  };

  function t(key) {
    return D[key] || key;
  }

  /* ---------- перевод DOM ---------- */
  function applyTo(root) {
    if (!root || !root.querySelectorAll) return;

    var marked = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < marked.length; i++) {
      var k = marked[i].getAttribute('data-i18n');
      if (D[k]) marked[i].textContent = t(k);
    }
    var ph = root.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < ph.length; j++) {
      var k2 = ph[j].getAttribute('data-i18n-ph');
      if (D[k2]) ph[j].setAttribute('placeholder', t(k2));
    }
    var ti = root.querySelectorAll('[data-i18n-title]');
    for (var n = 0; n < ti.length; n++) {
      var k3 = ti[n].getAttribute('data-i18n-title');
      if (D[k3]) ti[n].setAttribute('title', t(k3));
    }
    autoText(root);
  }

  // подмена текстов, которые рисует чужой код (вставляет русский текст
  // напрямую, мимо data-i18n) — ловим по точному совпадению строки
  function autoText(root) {
    // hasOwnProperty: короткий текст вроде "constructor"/"toString" иначе
    // резолвится через прототип в унаследованную функцию, а не в undefined
    var has = Object.prototype.hasOwnProperty;
    walk(root, function (s) { return has.call(AUTO, s) ? t(AUTO[s]) : null; });
  }

  function walk(root, map) {
    var w;
    try {
      w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    } catch (e) { return; }
    var list = [], node;
    while ((node = w.nextNode())) list.push(node);
    for (var i = 0; i < list.length; i++) {
      var tn = list[i];
      var p = tn.parentNode;
      if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.__noI18n) continue;
      var raw = tn.nodeValue;
      var trimmed = raw.trim();
      if (!trimmed || trimmed.length > 60) continue;
      var next = map(trimmed);
      if (next && next !== trimmed) tn.nodeValue = raw.replace(trimmed, next);
    }
    // варианты у <option> и <input value>
    var opts = root.querySelectorAll ? root.querySelectorAll('option') : [];
    for (var o = 0; o < opts.length; o++) {
      var ov = (opts[o].textContent || '').trim();
      var nv = map(ov);
      if (nv && nv !== ov) opts[o].textContent = nv;
    }
    var inputs = root.querySelectorAll ? root.querySelectorAll('input[placeholder]') : [];
    for (var q = 0; q < inputs.length; q++) {
      var pv = (inputs[q].getAttribute('placeholder') || '').trim();
      var pn = map(pv);
      if (pn && pn !== pv) inputs[q].setAttribute('placeholder', pn);
    }
  }

  /* ---------- старт ---------- */
  function boot() {
    document.documentElement.setAttribute('lang', 'en');
    applyTo(document.body || document.documentElement);
    // чужие скрипты рисуют интерфейс с задержкой — добираем их
    setTimeout(function () { applyTo(document.body || document.documentElement); }, 250);
    setTimeout(function () { applyTo(document.body || document.documentElement); }, 900);
    /* bf-lang больше не значит смену языка (его больше нет) — событие
       осталось как сигнал «I18N готов», на него всё ещё подписан код
       на нескольких страницах, который перерисовывает свои списки
       через T()/TR() после того, как словарь стал доступен. */
    window.dispatchEvent(new CustomEvent('bf-lang', { detail: { lang: 'en' } }));

    // чужие бандлы дорисовывают интерфейс позже — следим
    try {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          for (var j = 0; j < muts[i].addedNodes.length; j++) {
            var n = muts[i].addedNodes[j];
            if (n.nodeType === 1) applyTo(n);
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  window.I18N = {
    t: t, apply: applyTo,
    current: 'en'
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
