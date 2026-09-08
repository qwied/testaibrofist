/* AIBROFIST — автоперевод интерфейса
   БАЗОВЫЙ ЯЗЫК САЙТА — английский. Он же язык ссылок и заголовков страниц.
   Дальше язык меняется только явным выбором игрока в Settings
   (сохраняется в браузер и в аккаунт). Автоперевод «по стране» отключён.
   Порядок в массивах: ru, en, uk, de, fr, es, pt, pl, tr, zh            */
(function () {
  'use strict';

  var LANGS = ['ru', 'en', 'uk', 'de', 'fr', 'es', 'pt', 'pl', 'tr', 'zh'];
  var NAMES = {
    ru: 'Русский', en: 'English', uk: 'Українська', de: 'Deutsch', fr: 'Français',
    es: 'Español', pt: 'Português', pl: 'Polski', tr: 'Türkçe', zh: '中文'
  };

  var D = {
    /* ---------- шапка и навигация ---------- */
    leaderboard:  ['Таблица лидеров','Leaderboard','Таблиця лідерів','Bestenliste','Classement','Clasificación','Classificação','Ranking','Sıralama','排行榜'],
    editor:       ['Редактор','Editor','Редактор','Editor','Éditeur','Editor','Editor','Edytor','Düzenleyici','编辑器'],
    browser:      ['Обзор','Browser','Огляд','Übersicht','Navigateur','Explorador','Explorador','Przeglądarka','Tarayıcı','浏览'],
    mapEditor:    ['Редактор карт','Map Editor','Редактор карт','Karten-Editor','Éditeur de cartes','Editor de mapas','Editor de mapas','Edytor map','Harita düzenleyici','地图编辑器'],
    skinEditor:   ['Редактор скинов','Skin Editor','Редактор скінів','Skin-Editor','Éditeur de skins','Editor de skins','Editor de skins','Edytor skinów','Görünüm düzenleyici','皮肤编辑器'],
    mapsBrowser:  ['Обзор карт','Maps Browser','Огляд карт','Kartenübersicht','Navigateur de cartes','Navegador de mapas','Navegador de mapas','Przeglądarka map','Harita tarayıcısı','地图库'],
    skinsBrowser: ['Обзор скинов','Skins Browser','Огляд скінів','Skin-Übersicht','Navigateur de skins','Navegador de skins','Navegador de skins','Przeglądarka skinów','Görünümler','皮肤库'],
    avatar:       ['Аватар','Avatar','Аватар','Avatar','Avatar','Avatar','Avatar','Awatar','Avatar','头像'],
    shop:         ['Магазин','Shop','Магазин','Shop','Boutique','Tienda','Loja','Sklep','Mağaza','商店'],
    logs:         ['Новости','Logs','Новини','Neuigkeiten','Journal','Novedades','Novidades','Aktualności','Günlük','更新日志'],
    menu:         ['Меню','Menu','Меню','Menü','Menu','Menú','Menu','Menu','Menü','菜单'],
    supporters:   ['Поддержавшие','Supporters','Ті, хто підтримав','Unterstützer','Soutiens','Colaboradores','Apoiadores','Wspierający','Destekçiler','支持者'],
    tutorial:     ['Обучение редактору','Editor Tutorial','Навчання редактору','Editor-Tutorial','Tutoriel','Tutorial','Tutorial','Samouczek','Eğitim','编辑器教程'],
    privacy:      ['Политика конфиденциальности','Privacy Policy','Політика конфіденційності','Datenschutz','Confidentialité','Privacidad','Privacidade','Prywatność','Gizlilik','隐私政策'],
    terms:        ['Условия использования','Terms & Conditions','Умови використання','Nutzungsbedingungen','Conditions','Términos','Termos','Regulamin','Şartlar','使用条款'],
    settings:     ['Настройки','Settings','Налаштування','Einstellungen','Paramètres','Ajustes','Configurações','Ustawienia','Ayarlar','设置'],
    viewProfile:  ['Мой профиль','View profile','Мій профіль','Profil ansehen','Voir le profil','Ver perfil','Ver perfil','Mój profil','Profili gör','查看资料'],
    logout:       ['Выйти','Log out','Вийти','Abmelden','Déconnexion','Salir','Sair','Wyloguj','Çıkış','退出'],
    signin:       ['Войти','Sign in','Увійти','Anmelden','Connexion','Entrar','Entrar','Zaloguj','Giriş','登录'],

    /* ---------- режимы ---------- */
    twoPlayer:    ['Игра на двоих','Two Player Adventure','Гра на двох','Zwei Spieler','Deux joueurs','Dos jugadores','Dois jogadores','Dla dwojga','İki oyuncu','双人冒险'],
    hideAndSeek:  ['Прятки','Hide and Seek','Хованки','Verstecken','Cache-cache','Escondite','Esconde-esconde','Chowany','Saklambaç','捉迷藏'],
    sandbox:      ['Песочница','Sandbox','Пісочниця','Sandkasten','Bac à sable','Sandbox','Sandbox','Piaskownica','Serbest mod','沙盒'],
    race:         ['Гонка','Race','Перегони','Rennen','Course','Carrera','Corrida','Wyścig','Yarış','竞速'],

    /* ---------- вход ---------- */
    signInOrUp:   ['Вход или регистрация','Sign in or sign up','Вхід або реєстрація','Anmelden oder registrieren','Connexion ou inscription','Entrar o registrarse','Entrar ou registar','Zaloguj lub zarejestruj','Giriş veya kayıt','登录或注册'],
    loginAcc:     ['Войти в аккаунт','Log in','Увійти в акаунт','Einloggen','Se connecter','Iniciar sesión','Iniciar sessão','Zaloguj się','Hesaba gir','登录账号'],
    createAcc:    ['Создать аккаунт','Create account','Створити акаунт','Konto erstellen','Créer un compte','Crear cuenta','Criar conta','Utwórz konto','Hesap oluştur','创建账号'],
    phLogin:      ['Логин','Username','Логін','Benutzername','Identifiant','Usuario','Utilizador','Login','Kullanıcı adı','用户名'],
    phPass:       ['Пароль','Password','Пароль','Passwort','Mot de passe','Contraseña','Palavra-passe','Hasło','Şifre','密码'],
    enterLogin:   ['Введите логин','Enter a username','Введіть логін','Benutzername eingeben','Saisissez un identifiant','Introduce el usuario','Introduza o utilizador','Podaj login','Kullanıcı adı gir','请输入用户名'],
    enterPass:    ['Введите пароль','Enter a password','Введіть пароль','Passwort eingeben','Saisissez un mot de passe','Introduce la contraseña','Introduza a palavra-passe','Podaj hasło','Şifre gir','请输入密码'],
    checking:     ['Проверяю…','Checking…','Перевіряю…','Prüfe…','Vérification…','Comprobando…','A verificar…','Sprawdzam…','Kontrol ediliyor…','验证中…'],
    creating:     ['Создаю…','Creating…','Створюю…','Erstelle…','Création…','Creando…','A criar…','Tworzę…','Oluşturuluyor…','创建中…'],

    /* ---------- редактор скинов ---------- */
    skinTitle:    ['Редактор скинов','Skin Editor','Редактор скінів','Skin-Editor','Éditeur de skins','Editor de skins','Editor de skins','Edytor skinów','Görünüm düzenleyici','皮肤编辑器'],
    slotColor:    ['Цвет','Colour','Колір','Farbe','Couleur','Color','Cor','Kolor','Renk','颜色'],
    slotHead:     ['Голова','Head','Голова','Kopf','Tête','Cabeza','Cabeça','Głowa','Kafa','头部'],
    slotFace:     ['Лицо','Face','Обличчя','Gesicht','Visage','Cara','Rosto','Twarz','Yüz','面部'],
    slotBody:     ['Тело','Body','Тіло','Körper','Corps','Cuerpo','Corpo','Ciało','Gövde','身体'],
    slotBack:     ['За спиной','Back','За спиною','Rücken','Dos','Espalda','Costas','Plecy','Sırt','背部'],
    buy:          ['Купить','Buy','Купити','Kaufen','Acheter','Comprar','Comprar','Kup','Satın al','购买'],
    equip:        ['Надеть','Equip','Вдягнути','Anlegen','Équiper','Equipar','Equipar','Załóż','Kuşan','装备'],
    equipped:     ['Надето','Equipped','Вдягнено','Angelegt','Équipé','Equipado','Equipado','Założone','Kuşanıldı','已装备'],
    ownedTxt:     ['Куплено','Owned','Куплено','Gekauft','Acheté','Comprado','Comprado','Kupione','Zaten senin','已拥有'],
    free:         ['Бесплатно','Free','Безкоштовно','Kostenlos','Gratuit','Gratis','Grátis','Za darmo','Ücretsiz','免费'],
    coins:        ['Монеты','Coins','Монети','Münzen','Pièces','Monedas','Moedas','Monety','Jeton','金币'],
    notEnough:    ['Не хватает монет','Not enough coins','Не вистачає монет','Nicht genug Münzen','Pièces insuffisantes','Faltan monedas','Moedas insuficientes','Za mało monet','Yeterli jeton yok','金币不足'],
    saved:        ['Сохранено','Saved','Збережено','Gespeichert','Enregistré','Guardado','Guardado','Zapisano','Kaydedildi','已保存'],
    save:         ['Сохранить','Save','Зберегти','Speichern','Enregistrer','Guardar','Guardar','Zapisz','Kaydet','保存'],
    randomize:    ['Случайный образ','Randomize','Випадковий образ','Zufällig','Aléatoire','Aleatorio','Aleatório','Losowo','Rastgele','随机'],
    resetAll:     ['Сбросить','Reset','Скинути','Zurücksetzen','Réinitialiser','Restablecer','Repor','Resetuj','Sıfırla','重置'],
    shopTab:      ['Магазин','Shop','Магазин','Shop','Boutique','Tienda','Loja','Sklep','Mağaza','商店'],
    myTab:        ['Мои вещи','My items','Мої речі','Meine Sachen','Mes objets','Mis objetos','Os meus itens','Moje rzeczy','Eşyalarım','我的物品'],
    preview:      ['Предпросмотр','Preview','Попередній перегляд','Vorschau','Aperçu','Vista previa','Pré-visualização','Podgląd','Önizleme','预览'],

    skinSub:      ['Все детали бесплатны. Готовый образ сохраняется в «Мои скины».','Every part is free. Your look is saved to “My skins”.','Усі деталі безкоштовні. Готовий образ зберігається в «Мої скіни».','Alle Teile sind kostenlos. Der fertige Look wird in „Meine Skins“ gespeichert.','Toutes les pièces sont gratuites. Le look est enregistré dans « Mes skins ».','Todas las piezas son gratis. El look se guarda en «Mis skins».','Todas as peças são grátis. O visual fica guardado em «Meus skins».','Wszystkie części są darmowe. Gotowy wygląd trafia do «Moje skiny».','Tüm parçalar ücretsiz. Hazır görünüm «Görünümlerim»e kaydedilir.','所有部件均免费，完成的造型会保存到「我的皮肤」。'],
    avatarSub:    ['Одевай персонажа, покупай вещи за монеты и сохраняй готовые образы.','Dress up your character, buy items for coins and save your looks.','Одягай персонажа, купуй речі за монети та зберігай готові образи.','Kleide deinen Charakter, kaufe Dinge für Münzen und speichere deine Looks.','Habille ton personnage, achète des objets contre des pièces et enregistre tes looks.','Viste a tu personaje, compra objetos por monedas y guarda tus looks.','Vista o seu personagem, compre itens por moedas e guarde os seus visuais.','Ubierz postać, kupuj rzeczy za monety i zapisuj swoje wyglądy.','Karakterini giydir, jetonla eşya al ve görünümlerini kaydet.','装扮角色，用金币购买物品并保存造型。'],
    tabWear:      ['Одежда','Outfits','Одяг','Kleidung','Tenues','Ropa','Roupas','Ubrania','Kıyafet','装扮'],
    tabLooks:     ['Готовые скины','Ready skins','Готові скіни','Fertige Skins','Skins prêts','Skins listos','Skins prontos','Gotowe skiny','Hazır görünümler','成品皮肤'],
    tabMine:      ['Мои скины','My skins','Мої скіни','Meine Skins','Mes skins','Mis skins','Meus skins','Moje skiny','Görünümlerim','我的皮肤'],
    saveToMine:   ['Сохранить в «Мои скины»','Save to My skins','Зберегти в «Мої скіни»','In „Meine Skins“ speichern','Enregistrer dans « Mes skins »','Guardar en «Mis skins»','Guardar em «Meus skins»','Zapisz do «Moje skiny»','«Görünümlerim»e kaydet','保存到「我的皮肤」'],
    shopEmpty:    ['Готовых скинов пока нет.','No ready skins yet.','Готових скінів поки немає.','Noch keine fertigen Skins.','Pas encore de skins prêts.','Aún no hay skins listos.','Ainda não há skins prontos.','Nie ma jeszcze gotowych skinów.','Henüz hazır görünüm yok.','暂无成品皮肤。'],
    mineGuest:    ['Войдите в аккаунт, чтобы сохранять свои образы.','Sign in to save your looks.','Увійдіть в акаунт, щоб зберігати свої образи.','Melde dich an, um eigene Looks zu speichern.','Connectez-vous pour enregistrer vos looks.','Inicia sesión para guardar tus looks.','Inicie sessão para guardar os seus visuais.','Zaloguj się, aby zapisywać swoje wyglądy.','Görünümlerini kaydetmek için giriş yap.','登录后即可保存自己的造型。'],
    mineEmpty:    ['Здесь пока пусто. Одень персонажа и нажми «Сохранить в «Мои скины»».','Nothing here yet. Dress up and press “Save to My skins”.','Тут поки порожньо. Одягни персонажа та натисни «Зберегти в «Мої скіни»».','Noch nichts hier. Kleide dich an und drücke „In Meine Skins speichern“.','Rien ici pour l\'instant. Habillez votre personnage et enregistrez le look.','Aquí todavía no hay nada. Viste a tu personaje y pulsa «Guardar en Mis skins».','Ainda não há nada aqui. Vista o personagem e toque em «Guardar em Meus skins».','Tu jeszcze pusto. Ubierz postać i kliknij «Zapisz do Moje skiny».','Burası henüz boş. Karakterini giydir ve «Görünümlerim»e kaydet\'e bas.','这里还是空的。装扮角色并点击「保存到我的皮肤」。'],
    openAvatar:   ['Открыть Avatar','Open Avatar','Відкрити Avatar','Avatar öffnen','Ouvrir Avatar','Abrir Avatar','Abrir Avatar','Otwórz Avatar','Avatar\'ı aç','打开 Avatar'],
    publishSkin:  ['Добавить в Готовые скины','Add to Ready skins','Додати в Готові скіни','Zu fertigen Skins hinzufügen','Ajouter aux skins prêts','Añadir a Skins listos','Adicionar a Skins prontos','Dodaj do gotowych skinów','Hazır görünümlere ekle','添加到成品皮肤'],
    minePlaces:   ['Свободно мест в «Мои скины»','Free slots in My skins','Вільно місць у «Мої скіни»','Freie Plätze in „Meine Skins“','Places libres dans « Mes skins »','Espacios libres en «Mis skins»','Espaços livres em «Meus skins»','Wolne miejsca w «Moje skiny»','«Görünümlerim»de boş yer','「我的皮肤」剩余位置'],
    skinNameAsk:  ['Название скина (2–30 символов):','Skin name (2–30 characters):','Назва скіна (2–30 символів):','Skin-Name (2–30 Zeichen):','Nom du skin (2–30 caractères) :','Nombre del skin (2–30 caracteres):','Nome do skin (2–30 caracteres):','Nazwa skina (2–30 znaków):','Görünüm adı (2–30 karakter):','皮肤名称（2–30 个字符）：'],
    skinNameShort:['Слишком короткое название','Name is too short','Занадто коротка назва','Name zu kurz','Nom trop court','Nombre demasiado corto','Nome muito curto','Nazwa za krótka','Ad çok kısa','名称太短'],
    openSkinsBrowser:['Открыть Skins Browser?','Open the Skins Browser?','Відкрити Skins Browser?','Skins Browser öffnen?','Ouvrir le Skins Browser ?','¿Abrir el Skins Browser?','Abrir o Skins Browser?','Otworzyć Skins Browser?','Skins Browser açılsın mı?','打开皮肤库？'],
    noSkins:      ['Скины не найдены','No skins found','Скіни не знайдено','Keine Skins gefunden','Aucun skin','No hay skins','Sem skins','Brak skinów','Görünüm yok','未找到皮肤'],
    tryOn:        ['Примерить','Try on','Приміряти','Anprobieren','Essayer','Probar','Experimentar','Przymierz','Dene','试穿'],
    wornOk:       ['Скин надет','Skin equipped','Скін вдягнено','Skin angelegt','Skin équipé','Skin equipado','Skin equipado','Skin założony','Görünüm kuşanıldı','已装备皮肤'],
    toAvatar:     ['В Avatar','To Avatar','В Avatar','Zu Avatar','Vers Avatar','A Avatar','Para Avatar','Do Avatar','Avatar\'a','加入 Avatar'],
    removeAvatar: ['Убрать из Avatar','Remove from Avatar','Прибрати з Avatar','Aus Avatar entfernen','Retirer d\'Avatar','Quitar de Avatar','Remover de Avatar','Usuń z Avatar','Avatar\'dan çıkar','移出 Avatar'],
    priceCoins:   ['Цена в монетах','Price in coins','Ціна в монетах','Preis in Münzen','Prix en pièces','Precio en monedas','Preço em moedas','Cena w monetach','Jeton fiyatı','价格（金币）'],
    avatarEmpty:  ['Разработчик пока не отобрал ни одного скина.','The developer has not picked any skins yet.','Розробник поки не відібрав жодного скіна.','Der Entwickler hat noch keine Skins ausgewählt.','Le développeur n\'a encore choisi aucun skin.','El desarrollador aún no ha elegido skins.','O programador ainda não escolheu skins.','Twórca nie wybrał jeszcze skinów.','Geliştirici henüz görünüm seçmedi.','开发者尚未挑选皮肤。'],
    skinBy:       ['Скин','Skin','Скін','Skin','Skin','Skin','Skin','Skin','Görünüm','皮肤'],
    ownSkin:      ['Собственный образ','Your own look','Власний образ','Eigener Look','Votre propre look','Tu propio look','O seu visual','Własny wygląd','Kendi görünümün','你自己的造型'],
    bought:       ['Куплено','Purchased','Куплено','Gekauft','Acheté','Comprado','Comprado','Kupione','Satın alındı','已购买'],

    changePass:   ['Сменить пароль','Change password','Змінити пароль','Passwort ändern','Changer le mot de passe','Cambiar contraseña','Mudar palavra-passe','Zmień hasło','Şifre değiştir','修改密码'],
    curPass:      ['Текущий пароль','Current password','Поточний пароль','Aktuelles Passwort','Mot de passe actuel','Contraseña actual','Palavra-passe atual','Obecne hasło','Mevcut şifre','当前密码'],
    newPass:      ['Новый пароль (от 4 символов)','New password (4+ characters)','Новий пароль (від 4 символів)','Neues Passwort (mind. 4 Zeichen)','Nouveau mot de passe (4+ caractères)','Nueva contraseña (4+ caracteres)','Nova palavra-passe (4+ caracteres)','Nowe hasło (od 4 znaków)','Yeni şifre (4+ karakter)','新密码（4位以上）'],
    logoutAll:    ['Выйти на всех устройствах','Log out everywhere','Вийти на всіх пристроях','Überall abmelden','Déconnexion partout','Salir en todos lados','Sair em todos','Wyloguj wszędzie','Her yerden çık','全设备退出'],
    secNote:      ['Пароль хранится в зашифрованном виде — его не видно даже администратору.','Your password is stored hashed — even the admin cannot see it.','Пароль зберігається у зашифрованому вигляді — його не видно навіть адміністратору.','Dein Passwort wird gehasht gespeichert — selbst der Admin kann es nicht sehen.','Votre mot de passe est stocké haché — même l\'admin ne peut pas le voir.','Tu contraseña se guarda cifrada — ni el admin puede verla.','A sua palavra-passe é guardada com hash — nem o admin a vê.','Hasło jest przechowywane jako skrót — nawet admin go nie zobaczy.','Şifreniz karma olarak saklanır — admin bile göremez.','密码以哈希存储——连管理员也看不到。'],
    fillBoth:     ['Заполните оба поля','Fill in both fields','Заповніть обидва поля','Beide Felder ausfüllen','Remplissez les deux champs','Rellena ambos campos','Preencha ambos os campos','Wypełnij oba pola','İki alanı da doldur','请填写两个字段'],

    addFromUrl:   ['Из ссылки','From URL','З посилання','Aus URL','Depuis un lien','Desde enlace','A partir de link','Z linku','Bağlantıdan','从链接'],
    addFromFile:  ['Из файла','From file','З файлу','Aus Datei','Depuis un fichier','Desde archivo','A partir de ficheiro','Z pliku','Dosyadan','从文件'],
    setImage:     ['Задать картинку','Set image','Задати картинку','Bild setzen','Définir l\'image','Poner imagen','Definir imagem','Ustaw obraz','Görsel ata','设置图片'],
    changeImage:  ['Сменить картинку','Change image','Змінити картинку','Bild ändern','Changer l\'image','Cambiar imagen','Mudar imagem','Zmień obraz','Görseli değiştir','更换图片'],
    imageAsk:     ['Ссылка на картинку (пусто — убрать):','Image URL (empty to remove):','Посилання на картинку (порожньо — прибрати):','Bild-URL (leer zum Entfernen):','Lien de l\'image (vide pour retirer) :','Enlace de la imagen (vacío para quitar):','Link da imagem (vazio para remover):','Link do obrazu (puste — usuń):','Görsel bağlantısı (boş — kaldır):','图片链接（留空则移除）：'],
    needUrl:      ['Вставьте ссылку на картинку','Paste an image URL','Вставте посилання на картинку','Bild-URL einfügen','Collez un lien d\'image','Pega un enlace de imagen','Cole um link de imagem','Wklej link do obrazu','Görsel bağlantısı yapıştır','请粘贴图片链接'],
    imgTooBig:    ['Картинка слишком тяжёлая даже после сжатия','Image is too heavy even after compression','Картинка завелика навіть після стиснення','Bild ist auch komprimiert zu groß','Image trop lourde même compressée','La imagen pesa demasiado incluso comprimida','Imagem pesada demais mesmo comprimida','Obraz za ciężki nawet po kompresji','Görsel sıkıştırıldıktan sonra da çok büyük','图片压缩后仍然过大'],
    imgBad:       ['Не удалось прочитать картинку','Could not read the image','Не вдалося прочитати картинку','Bild konnte nicht gelesen werden','Impossible de lire l\'image','No se pudo leer la imagen','Não foi possível ler a imagem','Nie udało się odczytać obrazu','Görsel okunamadı','无法读取图片'],

    lightTheme:   ['Светлая','Light','Світла','Hell','Clair','Claro','Claro','Jasny','Açık','浅色'],
    darkTheme:    ['Тёмная','Dark','Темна','Dunkel','Sombre','Oscuro','Escuro','Ciemny','Koyu','深色'],
    modeFree:     ['Светлая и тёмная тема открываются один раз за 100 монет.','Light and dark unlock once for 100 coins.','Світла і темна тема відкриваються один раз за 100 монет.','Hell und Dunkel werden einmalig für 100 Münzen freigeschaltet.','Clair et sombre se débloquent une fois pour 100 pièces.','Claro y oscuro se desbloquean una vez por 100 monedas.','Claro e escuro desbloqueiam uma vez por 100 moedas.','Jasny i ciemny odblokowujesz raz za 100 monet.','Açık ve koyu tek seferde 100 jetona açılır.','浅色与深色一次性 100 金币解锁。'],
    themes:       ['Темы','Themes','Теми','Themes','Thèmes','Temas','Temas','Motywy','Temalar','主题'],
    themesSub:    ['Светлое и тёмное оформление сайта.','Light and dark look for the site.','Світле і темне оформлення сайту.','Helles und dunkles Design der Seite.','Apparence claire et sombre du site.','Aspecto claro y oscuro del sitio.','Aparência clara e escura do site.','Jasny i ciemny wygląd strony.','Sitenin açık ve koyu görünümü.','网站的浅色与深色外观。'],
    yourColors:   ['Ваши цвета','Your colours','Ваші кольори','Deine Farben','Vos couleurs','Tus colores','As suas cores','Twoje kolory','Renklerin','你的颜色'],
    allColors:    ['Все цвета','All colours','Усі кольори','Alle Farben','Toutes les couleurs','Todos los colores','Todas as cores','Wszystkie kolory','Tüm renkler','所有颜色'],
    readySets:    ['Готовые наборы','Ready-made sets','Готові набори','Fertige Sets','Ensembles prêts','Conjuntos listos','Conjuntos prontos','Gotowe zestawy','Hazır setler','预设组合'],
    pickerHint:   ['Нажмите на свой цвет в квадрате выше, чтобы выбрать любой оттенок.','Tap a colour square above to pick any shade you like.','Натисніть на свій колір у квадраті вище, щоб обрати будь-який відтінок.','Tippe oben auf ein Farbfeld, um jeden Ton zu wählen.','Touchez un carré ci-dessus pour choisir n\'importe quelle teinte.','Toca un cuadro de arriba para elegir cualquier tono.','Toque num quadrado acima para escolher qualquer tom.','Dotknij kwadratu powyżej, aby wybrać dowolny odcień.','Herhangi bir tonu seçmek için yukarıdaki kareye dokun.','点击上方色块可选择任意色调。'],
    slotsHint:    ['Выбрано цветов: ','Colours picked: ','Обрано кольорів: ','Farben gewählt: ','Couleurs choisies : ','Colores elegidos: ','Cores escolhidas: ','Wybrane kolory: ','Seçilen renkler: ','已选颜色：'],
    pickFirst:    ['Пока ничего не выбрано — нажмите цвет ниже.','Nothing picked yet — tap a colour below.','Поки нічого не обрано — натисніть колір нижче.','Noch nichts gewählt — tippe unten auf eine Farbe.','Rien de choisi — touchez une couleur ci-dessous.','Nada elegido: toca un color abajo.','Nada escolhido — toque numa cor abaixo.','Nic nie wybrano — dotknij koloru poniżej.','Henüz seçim yok — aşağıdan renk seç.','尚未选择，请点下方颜色。'],
    themesLocked: ['Темы пока закрыты','Themes are still locked','Теми поки закриті','Themes sind noch gesperrt','Les thèmes sont verrouillés','Los temas están bloqueados','Os temas estão bloqueados','Motywy są zablokowane','Temalar henüz kilitli','主题尚未解锁'],
    themesWhat:   ['Открывает светлое и тёмное оформление всего сайта: шапка, кнопки, карточки, списки. Покупка разовая — дальше переключайте темы сколько угодно.','Unlocks the light and dark look across the whole site: header, buttons, cards, lists. One-time purchase, switch as often as you like afterwards.','Відкриває світле і темне оформлення всього сайту: шапка, кнопки, картки, списки. Купівля разова — далі перемикайте скільки завгодно.','Schaltet das helle und dunkle Design der ganzen Seite frei: Kopfzeile, Knöpfe, Karten, Listen. Einmalkauf, danach beliebig oft wechseln.','Débloque l’apparence claire et sombre de tout le site : en-tête, boutons, cartes, listes. Achat unique, changez ensuite à volonté.','Desbloquea el aspecto claro y oscuro de todo el sitio: cabecera, botones, tarjetas, listas. Compra única, luego cambia cuando quieras.','Desbloqueia a aparência clara e escura de todo o site: cabeçalho, botões, cartões, listas. Compra única, depois troque à vontade.','Odblokowuje jasny i ciemny wygląd całej strony: nagłówek, przyciski, karty, listy. Zakup jednorazowy, potem przełączaj dowolnie.','Tüm sitenin açık ve koyu görünümünü açar: başlık, düğmeler, kartlar, listeler. Tek seferlik alım, sonra istediğin kadar değiştir.','解锁整个网站的浅色与深色外观：顶栏、按钮、卡片、列表。一次购买，之后随意切换。'],
    unlockThemes: ['Открыть темы','Unlock themes','Відкрити теми','Themes freischalten','Débloquer les thèmes','Desbloquear temas','Desbloquear temas','Odblokuj motywy','Temaları aç','解锁主题'],
    defaultTheme: ['Вернуть обычное оформление','Back to the default look','Повернути звичайне оформлення','Zurück zum Standard-Look','Revenir à l\'apparence par défaut','Volver al aspecto por defecto','Voltar ao aspeto padrão','Wróć do domyślnego wyglądu','Varsayılan görünüme dön','恢复默认外观'],

    /* ---------- язык ---------- */
    language:     ['Язык','Language','Мова','Sprache','Langue','Idioma','Idioma','Język','Dil','语言'],
    langAuto:     ['Автоматически (по стране)','Automatic (by country)','Автоматично (за країною)','Automatisch (nach Land)','Automatique (par pays)','Automático (por país)','Automático (por país)','Automatycznie (wg kraju)','Otomatik (ülkeye göre)','自动（按国家）'],
    langHint:     ['Интерфейс переводится сам по стране игрока. Можно выбрать язык вручную.','The interface is translated automatically by country. You can pick a language manually.','Інтерфейс перекладається автоматично за країною. Мову можна обрати вручну.','Die Oberfläche wird automatisch nach Land übersetzt. Sprache ist manuell wählbar.','L\'interface est traduite automatiquement selon le pays. Vous pouvez choisir la langue.','La interfaz se traduce automáticamente según el país. Puedes elegir el idioma.','A interface é traduzida automaticamente pelo país. Pode escolher o idioma.','Interfejs tłumaczy się automatycznie wg kraju. Język można wybrać ręcznie.','Arayüz ülkeye göre otomatik çevrilir. Dili elle seçebilirsin.','界面按国家自动翻译，也可手动选择语言。'],

    /* ---------- обзор карт ---------- */
    colName:      ['Название','Name','Назва','Name','Nom','Nombre','Nome','Nazwa','Ad','名称'],
    colRating:    ['Рейтинг','Rating','Рейтинг','Bewertung','Note','Valoración','Avaliação','Ocena','Puan','评分'],
    colAuthor:    ['Автор','Author','Автор','Autor','Auteur','Autor','Autor','Autor','Yazar','作者'],
    colDate:      ['Дата','Date','Дата','Datum','Date','Fecha','Data','Data','Tarih','日期'],
    play:         ['Играть','PLAY','Грати','Spielen','Jouer','Jugar','Jogar','Graj','Oyna','开始'],
    refresh:      ['Обновить','Refresh','Оновити','Aktualisieren','Actualiser','Actualizar','Atualizar','Odśwież','Yenile','刷新'],
    noMaps:       ['Карты не найдены','No maps found','Карти не знайдено','Keine Karten gefunden','Aucune carte','No hay mapas','Sem mapas','Brak map','Harita yok','未找到地图'],
    sortDate:     ['Сортировать по дате','Sort by date','Сортувати за датою','Nach Datum','Trier par date','Ordenar por fecha','Ordenar por data','Sortuj wg daty','Tarihe göre','按日期排序'],
    sortRating:   ['Сортировать по рейтингу','Sort by rating','Сортувати за рейтингом','Nach Bewertung','Trier par note','Ordenar por valoración','Ordenar por avaliação','Sortuj wg oceny','Puana göre','按评分排序'],
    modeAll:      ['Режим: все','Mode: All','Режим: усі','Modus: alle','Mode : tous','Modo: todos','Modo: todos','Tryb: wszystkie','Mod: hepsi','模式：全部'],

    mapsSub:      ['Карты игроков. Открывайте, играйте и оценивайте.','Player maps. Open them, play and rate.','Карти гравців. Відкривайте, грайте та оцінюйте.','Spieler-Karten. Öffnen, spielen und bewerten.','Cartes des joueurs. Ouvrez, jouez et notez.','Mapas de jugadores. Ábrelos, juega y valora.','Mapas de jogadores. Abra, jogue e avalie.','Mapy graczy. Otwieraj, graj i oceniaj.','Oyuncu haritaları. Aç, oyna ve oyla.','玩家地图。打开、游玩并评分。'],
    removeFriend: ['Удалить из друзей','Remove friend','Видалити з друзів','Freund entfernen','Retirer des amis','Quitar de amigos','Remover dos amigos','Usuń ze znajomych','Arkadaşlıktan çıkar','删除好友'],
    cancelReq:    ['Отменить заявку','Cancel request','Скасувати заявку','Anfrage zurückziehen','Annuler la demande','Cancelar solicitud','Cancelar pedido','Anuluj zaproszenie','İsteği iptal et','取消请求'],
    noAbout:      ['Ничего не написано','Nothing written yet','Нічого не написано','Noch nichts geschrieben','Rien d\'écrit','Nada escrito','Nada escrito','Nic nie napisano','Henüz bir şey yazılmadı','还没有内容'],
    emptyHere:    ['Пусто','Empty','Порожньо','Leer','Vide','Vacío','Vazio','Pusto','Boş','空'],
    nobodyFound:  ['Никого не нашлось','Nobody found','Нікого не знайдено','Niemand gefunden','Personne trouvée','No se encontró a nadie','Ninguém encontrado','Nikogo nie znaleziono','Kimse bulunamadı','未找到玩家'],
    noUser:       ['Игрок не указан','No player specified','Гравця не вказано','Kein Spieler angegeben','Aucun joueur indiqué','No se indicó jugador','Nenhum jogador indicado','Nie podano gracza','Oyuncu belirtilmedi','未指定玩家'],
    nowOnline:    ['сейчас в сети','online now','зараз у мережі','jetzt online','en ligne','en línea','online','teraz online','şu an çevrimiçi','当前在线'],
    minAgo:       ['мин назад','min ago','хв тому','Min. her','min','min','min','min temu','dk önce','分钟前'],
    hoursAgo:     ['ч назад','h ago','год тому','Std. her','h','h','h','godz. temu','sa önce','小时前'],
    daysAgo:      ['дн назад','d ago','дн тому','Tage her','j','d','d','dni temu','gün önce','天前'],
    deleted:      ['Карта удалена','Map deleted','Карту видалено','Karte gelöscht','Carte supprimée','Mapa eliminado','Mapa apagado','Mapa usunięta','Harita silindi','地图已删除'],
    confirmDel:   ['Точно удалить?','Delete for sure?','Точно видалити?','Wirklich löschen?','Supprimer vraiment ?','¿Eliminar de verdad?','Apagar mesmo?','Na pewno usunąć?','Gerçekten silinsin mi?','确定删除？'],

    /* ---------- инструменты владельца ---------- */
    ownerTools:   ['Инструменты владельца','Owner tools','Інструменти власника','Besitzer-Werkzeuge','Outils du propriétaire','Herramientas del dueño','Ferramentas do dono','Narzędzia właściciela','Sahip araçları','所有者工具'],
    addToGame:    ['Добавить в игру','Add to game','Додати в гру','Ins Spiel','Ajouter au jeu','Añadir al juego','Adicionar ao jogo','Dodaj do gry','Oyuna ekle','加入游戏'],
    inGameTxt:    ['В игре','In game','У грі','Im Spiel','Dans le jeu','En el juego','No jogo','W grze','Oyunda','已在游戏中'],
    removeGame:   ['Убрать из игры','Remove from game','Прибрати з гри','Aus dem Spiel','Retirer du jeu','Quitar del juego','Remover do jogo','Usuń z gry','Oyundan çıkar','移出游戏'],
    boostVotes:   ['Накрутка оценок','Set votes','Накрутка оцінок','Bewertungen setzen','Définir les votes','Fijar votos','Definir votos','Ustaw oceny','Oyları ayarla','设置投票'],
    likes:        ['Лайки','Likes','Лайки','Likes','J\'aime','Me gusta','Gostos','Polubienia','Beğeni','点赞'],
    dislikes:     ['Дизлайки','Dislikes','Дизлайки','Dislikes','Je n\'aime pas','No me gusta','Não gostos','Nie lubię','Beğenmeme','点踩'],
    apply:        ['Применить','Apply','Застосувати','Übernehmen','Appliquer','Aplicar','Aplicar','Zastosuj','Uygula','应用'],
    giveCoins:    ['Выдать монеты','Give coins','Видати монети','Münzen geben','Donner des pièces','Dar monedas','Dar moedas','Daj monety','Jeton ver','发放金币'],
    amount:       ['Количество','Amount','Кількість','Menge','Quantité','Cantidad','Quantidade','Ilość','Miktar','数量'],
    playerName:   ['Ник игрока','Player name','Нік гравця','Spielername','Nom du joueur','Nombre del jugador','Nome do jogador','Nick gracza','Oyuncu adı','玩家名'],
    onlyOwner:    ['Доступно только владельцу','Owner only','Доступно лише власнику','Nur für den Besitzer','Réservé au propriétaire','Solo para el dueño','Apenas para o dono','Tylko dla właściciela','Sadece sahip','仅所有者'],

    /* ---------- редактор карт ---------- */
    coinLimit:    ['В карте можно поставить максимум 3 монеты','A map can hold at most 3 coins','У карті можна поставити максимум 3 монети','Eine Karte darf höchstens 3 Münzen enthalten','Une carte accepte 3 pièces au maximum','Un mapa admite 3 monedas como máximo','Um mapa aceita no máximo 3 moedas','Mapa może mieć maksymalnie 3 monety','Bir haritada en fazla 3 jeton olabilir','一张地图最多放 3 枚金币'],
    publishMap:   ['Опубликовать в Maps Browser','Publish to Maps Browser','Опублікувати в Maps Browser','In Maps Browser veröffentlichen','Publier dans Maps Browser','Publicar en Maps Browser','Publicar no Maps Browser','Opublikuj w Maps Browser','Maps Browser\'a yayınla','发布到地图库'],

    joinDate:     ['Дата регистрации','Join Date','Дата реєстрації','Beitrittsdatum','Date d\'inscription','Fecha de registro','Data de registo','Data rejestracji','Katılma tarihi','注册日期'],
    accept:       ['Принять','Accept','Прийняти','Annehmen','Accepter','Aceptar','Aceitar','Akceptuj','Kabul et','接受'],
    decline:      ['Отклонить','Decline','Відхилити','Ablehnen','Refuser','Rechazar','Recusar','Odrzuć','Reddet','拒绝'],
    find:         ['Найти','Find','Знайти','Suchen','Trouver','Buscar','Procurar','Znajdź','Bul','查找'],
    searchUsers:  ['Поиск игроков','Search users','Пошук гравців','Spieler suchen','Rechercher des joueurs','Buscar jugadores','Procurar jogadores','Szukaj graczy','Oyuncu ara','搜索玩家'],
    addFriend:    ['Добавить в друзья','Add friend','Додати в друзі','Freund hinzufügen','Ajouter en ami','Añadir amigo','Adicionar amigo','Dodaj znajomego','Arkadaş ekle','加为好友'],
    report:       ['Пожаловаться','Report','Поскаржитися','Melden','Signaler','Reportar','Denunciar','Zgłoś','Bildir','举报'],
    editTxt:      ['Изменить','Edit','Змінити','Bearbeiten','Modifier','Editar','Editar','Edytuj','Düzenle','编辑'],
    removeTxt:    ['Удалить','Remove','Видалити','Entfernen','Retirer','Quitar','Remover','Usuń','Kaldır','移除'],
    friendsTxt:   ['Друзья','Friends','Друзі','Freunde','Amis','Amigos','Amigos','Znajomi','Arkadaşlar','好友'],
    requestsTxt:  ['Заявки','Requests','Заявки','Anfragen','Demandes','Solicitudes','Pedidos','Zaproszenia','İstekler','请求'],
    pendingTxt:   ['Отправленные','Pending','Надіслані','Ausstehend','En attente','Pendientes','Pendentes','Oczekujące','Bekleyen','待处理'],
    mapsTxt:      ['Карты','Maps','Карти','Karten','Cartes','Mapas','Mapas','Mapy','Haritalar','地图'],
    skinsTxt:     ['Скины','Skins','Скіни','Skins','Skins','Skins','Skins','Skiny','Görünümler','皮肤'],

    /* ---------- игровой экран ---------- */
    gPlayers:     ['Игроков','Players','Гравців','Spieler','Joueurs','Jugadores','Jogadores','Graczy','Oyuncu','玩家'],
    gPing:        ['Пинг','Ping','Пінг','Ping','Ping','Ping','Ping','Ping','Ping','延迟'],
    gPingMs:      ['мс','ms','мс','ms','ms','ms','ms','ms','ms','毫秒'],
    gTimeLbl:     ['Время','Time','Час','Zeit','Temps','Tiempo','Tempo','Czas','Süre','时间'],
    roleLbl:      ['Роль','Role','Роль','Rolle','Rôle','Rol','Papel','Rola','Rol','角色'],
    roleSeeker:   ['Искатель','Seeker','Шукач','Sucher','Chercheur','Buscador','Procurador','Szukający','Aranan','寻找者'],
    roleHider:    ['Прячется','Hider','Ховається','Versteckter','Cacheur','Se esconde','Esconde-se','Ukrywa się','Saklanan','躲藏者'],
    noMapsYet:    ['Карт пока нет','No maps yet','Карти поки відсутні','Noch keine Karten','Pas encore de cartes','Aún no hay mapas','Ainda não há mapas','Jeszcze nie ma map','Henüz harita yok','还没有地图'],
    publishHint:  ['Опубликуй карту в Map Editor','Publish a map in the Map Editor','Опублікуй карту в Map Editor','Veröffentliche eine Karte im Map Editor','Publie une carte dans le Map Editor','Publica un mapa en el Map Editor','Publica um mapa no Map Editor','Opublikuj mapę w Map Editor','Map Editor\'da bir harita yayınla','在地图编辑器中发布一张地图'],
    emptyTitle:   ['Здесь пока пусто','Nothing here yet','Тут поки порожньо','Hier ist noch nichts','Rien pour le moment','Aquí aún no hay nada','Ainda não há nada aqui','Tu jeszcze pusto','Burada henüz bir şey yok','这里还没有内容'],
    emptyText:    ['Никто ещё не опубликовал карту для этого режима. Открой Map Editor и выложи свою.','Nobody has published a map for this mode yet. Open the Map Editor and add yours.','Ніхто ще не опублікував карту для цього режиму. Відкрий Map Editor і виклади свою.','Für diesen Modus wurde noch keine Karte veröffentlicht. Öffne den Map Editor und füge deine hinzu.','Personne n\'a encore publié de carte pour ce mode. Ouvre le Map Editor et ajoute la tienne.','Nadie ha publicado aún un mapa para este modo. Abre el Map Editor y añade el tuyo.','Ainda ninguém publicou um mapa para este modo. Abre o Map Editor e adiciona o teu.','Nikt jeszcze nie opublikował mapy dla tego trybu. Otwórz Map Editor i dodaj swoją.','Bu mod için henüz kimse harita yayınlamadı. Map Editor\'u aç ve kendi haritani ekle.','还没有人为此模式发布地图。打开地图编辑器，发布你的作品吧。'],
    mapBy:        ['автор: ','by ','автор: ','von ','par ','por ','por ','autor: ','yapımcı: ','作者：'],
    brokenMap:    ['карта повреждена','map is corrupted','карта пошкоджена','Karte ist beschädigt','carte endommagée','mapa dañado','mapa corrompido','mapa uszkodzona','harita bozuk','地图已损坏'],
    waitTitle:    ['Ожидание игроков','Waiting for players','Очікування гравців','Warte auf Spieler','En attente de joueurs','Esperando jugadores','À espera de jogadores','Oczekiwanie na graczy','Oyuncu bekleniyor','等待玩家中'],
    waitText:     ['Роли распределятся через 30 секунд.','Roles will be picked in 30 seconds.','Розподіл ролей через 30 секунд.','Rollen werden in 30 Sekunden verteilt.','Les rôles seront tirés dans 30 secondes.','Los roles se asignarán en 30 segundos.','Os papéis serão sorteados em 30 segundos.','Role rozlosowano za 30 sekund.','Roller 30 saniye içinde dağıtılacak.','30 秒后分配角色。'],
    hsWaitText:   ['Нужен ещё хотя бы один игрок, чтобы начать раунд.','Need at least one more player to start the round.','Потрібен ще хоча б один гравець, щоб почати раунд.','Es wird noch mindestens ein weiterer Spieler benötigt, um die Runde zu starten.','Il faut au moins un joueur de plus pour commencer la manche.','Se necesita al menos un jugador más para empezar la ronda.','É necessário mais um jogador para começar a ronda.','Potrzebny jest jeszcze co najmniej jeden gracz, aby rozpocząć rundę.','Turu başlatmak için en az bir oyuncuya daha ihtiyaç var.','再需要至少一名玩家才能开始回合。'],
    dupTitle:     ['Аккаунт уже в игре','Account already in game','Акаунт уже в грі','Konto bereits im Spiel','Compte déjà en jeu','Cuenta ya está en el juego','Conta já está no jogo','Konto już w grze','Hesap zaten oyunda','账号已在游戏中'],
    dupText:      ['Этот аккаунт уже открыт в другой вкладке или на другом устройстве. Закрой её и обнови эту страницу.','This account is already open in another tab or device. Close it and refresh this page.','Цей акаунт уже відкритий в іншій вкладці або на іншому пристрої. Закрий її та онови цю сторінку.','Dieses Konto ist bereits in einem anderen Tab oder Gerät geöffnet. Schließe es und aktualisiere diese Seite.','Ce compte est déjà ouvert dans un autre onglet ou appareil. Ferme-le et actualise cette page.','Esta cuenta ya está abierta en otra pestaña o dispositivo. Ciérrala y actualiza esta página.','Esta conta já está aberta noutro separador ou dispositivo. Fecha-a e atualiza esta página.','To konto jest już otwarte na innej karcie lub urządzeniu. Zamknij ją i odśwież tę stronę.','Bu hesap başka bir sekmede veya cihazda zaten açık. Onu kapat ve bu sayfayı yenile.','该账号已在另一个标签页或设备上打开。请关闭它并刷新此页面。'],
    roundStart:   ['Раунд начался! 2 минуты','Round started! 2 minutes','Раунд почався! 2 хвилини','Runde gestartet! 2 Minuten','Manche lancée ! 2 minutes','¡Ronda iniciada! 2 minutos','Ronda iniciada! 2 minutos','Runda rozpoczęta! 2 minuty','Tur başladı! 2 dakika','回合开始！2 分钟'],
    roundOver:    ['Раунд окончен','Round over','Раунд закінчився','Runde beendet','Manche terminée','Ronda terminada','Ronda terminada','Runda zakończona','Tur bitti','回合结束'],
    newMapText:   ['Новая карта. До старта 30 секунд.','New map. Starting in 30 seconds.','Нова карта. До старту 30 секунд.','Neue Karte. Start in 30 Sekunden.','Nouvelle carte. Départ dans 30 secondes.','Mapa nuevo. Empieza en 30 segundos.','Novo mapa. Começa em 30 segundos.','Nowa mapa. Start za 30 sekund.','Yeni harita. 30 saniye içinde başlıyor.','新地图。30 秒后开始。'],
    timeUp:       ['Время вышло — следующая карта','Time\'s up — next map','Час вийшов — наступна карта','Zeit um — nächste Karte','Temps écoulé — carte suivante','Tiempo agotado — mapa siguiente','Tempo esgotado — próximo mapa','Czas minął — następna mapa','Süre doldu — sıradaki harita','时间到——下一张地图'],
    allCaughtT:   ['Все пойманы — раунд окончен!','Everyone caught — round over!','Усі спіймані — раунд закінчився!','Alle gefangen — Runde beendet!','Tous attrapés — manche terminée !','¡Todos atrapados — ronda terminada!','Todos apanhados — ronda terminada!','Wszyscy złapani — koniec rundy!','Herkes yakalandı — tur bitti!','全部被抓住——回合结束！'],
    roulTitle:    ['Выбор искателя','Choosing the seeker','Вибір шукача','Wahl des Suchers','Choix du chercheur','Eligiendo al buscador','Escolhendo o procurador','Wybór szukającego','Aranayan seçiliyor','选择寻找者'],
    roulSeekerIs: ['Искатель: ','Seeker: ','Шукач: ','Sucher: ','Chercheur : ','Buscador: ','Procurador: ','Szukający: ','Aranayan: ','寻找者：'],
    roulSpin:     ['Кому искать в этом раунде?','Who is seeking this round?','Кому шукати в цьому раунді?','Wer sucht diese Runde?','Qui cherche cette manche ?','¿Quién busca esta ronda?','Quem procura nesta ronda?','Kto szuka w tej rundzie?','Bu turda kim arayacak?','这一回合谁来找？'],
    roulYouSeek:  ['Ты — искатель!','You are the seeker!','Ти — шукач!','Du bist der Sucher!','Tu es le chercheur !','¡Eres el buscador!','És o procurador!','Jesteś szukającym!','Aranayan sensin!','你是寻找者！'],
    chanceLbl:    ['Твой шанс','Your chance','Твій шанс','Deine Chance','Ta chance','Tu probabilidad','A tua hipótese','Twoja szansa','Şansın','你的概率'],
    chatBtn:      ['Чат','Chat','Чат','Chat','Chat','Chat','Chat','Czat','Sohbet','聊天'],
    allCaughtC:   ['Все пойманы','Everyone caught','Усі спіймані','Alle gefangen','Tous attrapés','Todos atrapados','Todos apanhados','Wszyscy złapani','Herkes yakalandı','全部被抓住'],
    allFinished:  ['Все на финише — новая карта!','Everyone finished — new map!','Усі на фініші — нова карта!','Alle im Ziel — neue Karte!','Tous à l\'arrivée — nouvelle carte !','Todos en la meta — ¡mapa nuevo!','Todos na meta — novo mapa!','Wszyscy na mecie — nowa mapa!','Herkes varışta — yeni harita!','全部到达终点——新地图！'],
    finishSolo:   ['Финиш! Новая карта','Finish! New map','Фініш! Нова карта','Ziel! Neue Karte','Arrivée ! Nouvelle carte','¡Meta! Mapa nuevo','Meta! Novo mapa','Meta! Nowa mapa','Bitiş! Yeni harita','到达终点！新地图'],
    mapLog:       ['Карта: ','Map: ','Карта: ','Karte: ','Carte : ','Mapa: ','Mapa: ','Mapa: ','Harita: ','地图：'],
    byWord:       [' от ',' by ',' від ',' von ',' par ',' de ',' de ',' od ',' — ','，作者：'],
    coinsGain:    ['+{n} монет (всего {t})','+{n} coins ({t} in total)','+{n} монет (усього {t})','+{n} Münzen ({t} insgesamt)','+{n} pièces ({t} au total)','+{n} monedas ({t} en total)','+{n} moedas ({t} no total)','+{n} monet (razem {t})','+{n} jeton (toplam {t})','+{n} 金币（共 {t}）'],
    ratingLbl:    ['рейтинг: ','rating: ','рейтинг: ','Bewertung: ','note : ','valoración: ','avaliação: ','ocena: ','puan: ','评分：'],

    /* ---------- редактор скинов: рисование ---------- */
    drawZone:     ['Зона рисования','Drawing zone','Зона малювання','Zeichnbereich','Zone de dessin','Zona de dibujo','Zona de desenho','Strefa rysowania','Çizim bölgesi','绘制区域'],
    drawHint:     ['Нажми на голову или туловище на фигуре слева — редактировать можно только выбранную зону.','Tap the head or the body on the figure — only the picked zone can be edited.','Натисни на голову або тулуб на фігурі — редагувати можна лише обрану зону.','Tippe auf Kopf oder Körper der Figur — bearbeiten kannst du nur den gewählten Bereich.','Touche la tête ou le corps du personnage — seule la zone choisie peut être modifiée.','Toca la cabeza o el cuerpo de la figura — solo se edita la zona elegida.','Toca na cabeça ou no corpo da figura — só se edita a zona escolhida.','Dotknij głowy lub tułowia postaci — edytować można tylko wybraną strefę.','Figürdeki kafa veya gövdeye dokun — yalnızca seçilen bölge düzenlenebilir.','点击人物上的头部或身体——只能编辑选中的区域。'],
    brush:        ['Кисть','Brush','Пензель','Pinsel','Pinceau','Pincel','Pincel','Pędzel','Fırça','画笔'],
    eraser:       ['Ластик','Eraser','Гумка','Radierer','Gomme','Borrador','Borracha','Gumka','Silgi','橡皮'],
    undoTxt:      ['Отменить','Undo','Скасувати','Rückgängig','Annuler','Deshacer','Desfazer','Cofnij','Geri al','撤销'],
    nothingUndo:  ['Отменять нечего','Nothing to undo','Скасувати нічого','Nichts zum Rückgängig machen','Rien à annuler','Nada que deshacer','Nada a desfazer','Nie ma czego cofnąć','Geri alınacak bir şey yok','没有可撤销的操作'],
    clearZone:    ['Очистить зону','Clear zone','Очистити зону','Bereich löschen','Effacer la zone','Borrar zona','Limpar zona','Wyczyść strefę','Bölgeyi temizle','清除区域'],
    clearAll:     ['Очистить всё','Clear all','Очистити все','Alles löschen','Tout effacer','Borrar todo','Limpar tudo','Wyczyść wszystko','Tümünü temizle','全部清除'],
    brushSize:    ['Толщина кисти','Brush size','Товщина пензля','Pinselstärke','Taille du pinceau','Grosor del pincel','Espessura do pincel','Grubość pędzla','Fırça kalınlığı','画笔粗细'],
    anyColor:     ['Свой цвет','Custom colour','Свій колір','Eigene Farbe','Couleur perso','Color propio','Cor personalizada','Własny kolor','Özel renk','自定义颜色'],
    toolLbl:      ['Инструмент','Tool','Інструмент','Werkzeug','Outil','Herramienta','Ferramenta','Narzędzie','Araç','工具'],
    imgModeTxt:   ['Сейчас надет готовый скин-картинка.','A ready-made image skin is worn right now.','Зараз вдягнено готовий скін-картинку.','Gerade ist ein fertiger Bild-Skin angelegt.','Un skin-image prêt à l\'emploi est porté actuellement.','Ahora mismo llevas un skin de imagen ya hecho.','Neste momento está usado um skin de imagem pronto.','Obecnie założony jest gotowy skin-obrazek.','Şu anda hazır bir görsel skin kuşanılmış.','当前穿着的是现成的图片皮肤。'],
    drawAgain:    ['Рисовать','Draw','Малювати','Zeichnen','Dessiner','Dibujar','Desenhar','Rysuj','Çiz','去绘制'],
    alreadyOn:    ['Этот скин уже сохранён и надет','This skin is already saved and worn','Цей скін уже збережено й вдягнено','Dieser Skin ist bereits gespeichert und angelegt','Ce skin est déjà enregistré et porté','Este skin ya está guardado y equipado','Este skin já está guardado e usado','Ten skin jest już zapisany i założony','Bu skin çoktan kaydedildi ve kuşanıldı','该皮肤已保存并穿着'],
    publishDrawnOnly:['Опубликовать можно только нарисованный здесь скин','Only a skin drawn here can be published','Опублікувати можна лише намальований тут скін','Veröffentlichen kannst du nur einen hier gezeichneten Skin','On ne peut publier qu\'un skin dessiné ici','Solo se puede publicar un skin dibujado aquí','Só se pode publicar um skin desenhado aqui','Opublikować można tylko skin narysowany tutaj','Yalnızca burada çizilen bir skin yayınlanabilir','只能发布在这里绘制的皮肤'],

    /* ---------- общее ---------- */
    close:        ['Закрыть','Close','Закрити','Schließen','Fermer','Cerrar','Fechar','Zamknij','Kapat','关闭'],
    back:         ['Назад','Back','Назад','Zurück','Retour','Atrás','Voltar','Wstecz','Geri','返回'],
    cancel:       ['Отмена','Cancel','Скасувати','Abbrechen','Annuler','Cancelar','Cancelar','Anuluj','İptal','取消'],
    loading:      ['Загрузка…','Loading…','Завантаження…','Lädt…','Chargement…','Cargando…','A carregar…','Ładowanie…','Yükleniyor…','加载中…'],
    errorTxt:     ['Ошибка','Error','Помилка','Fehler','Erreur','Error','Erro','Błąd','Hata','错误'],
    serverDown:   ['Сервер недоступен','Server unavailable','Сервер недоступний','Server nicht erreichbar','Serveur indisponible','Servidor no disponible','Servidor indisponível','Serwer niedostępny','Sunucuya ulaşılamıyor','服务器不可用'],
    loginFirst:   ['Сначала войдите в аккаунт','Log in first','Спершу увійдіть в акаунт','Bitte zuerst anmelden','Connectez-vous d\'abord','Inicia sesión primero','Inicie sessão primeiro','Najpierw się zaloguj','Önce giriş yap','请先登录'],
    guest:        ['Гость','Guest','Гість','Gast','Invité','Invitado','Convidado','Gość','Misafir','访客'],
    notReady:     ['Этот раздел ещё не готов','This section is not ready yet','Цей розділ ще не готовий','Dieser Bereich ist noch nicht fertig','Cette section n\'est pas prête','Esta sección aún no está lista','Esta secção ainda não está pronta','Ta sekcja nie jest gotowa','Bu bölüm henüz hazır değil','该板块尚未开放'],

    /* ---------- страницы режимов ---------- */
    modeHsText:   ['Перед раундом на экране крутится рулетка: карточки игроков со скинами и никами, и серое полосатое выделение выбирает искателя. Шансы меняются каждый раунд, а недавние искатели получают шанс поменьше. Пока прячутся, искатель никого не видит — и его не видно.','Before each round a roulette spins on screen: player cards with skins and names, and a grey striped highlight picks the seeker. The odds change every round, and recent seekers get a smaller chance. While everyone hides, the seeker sees no one — and is seen by no one.','Перед раундом на екрані крутиться рулетка: картки гравців зі скінами та нікнеймами, і сіре смугасте виділення обирає шукача. Шанси змінюються щоразу, а недавні шукачі отримують менший шанс. Поки ховаються, шукач нікого не бачить — і його не видно.','Vor jeder Runde dreht sich ein Glücksrad auf dem Bildschirm: Karten mit Skins und Namen, der graue Streifen wählt den Sucher. Die Chancen ändern sich jede Runde, kürzliche Sucher haben eine kleinere Chance. Während sich alle verstecken, sieht der Sucher niemanden — und wird von niemandem gesehen.','Avant chaque manche, une roulette tourne à l\'écran : des cartes de joueurs avec skins et pseudos, et le surlignage gris rayé choisit le chercheur. Les chances changent à chaque manche, les chercheurs récents ont moins de chance. Pendant que tous se cachent, le chercheur ne voit personne — et personne ne le voit.','Antes de cada ronda, una ruleta gira en la pantalla: tarjetas de jugadores con skins y nombres, y el resaltado gris rayado elige al buscador. Las probabilidades cambian cada ronda, los buscadores recientes tienen menos suerte. Mientras todos se esconden, el buscador no ve a nadie — y nadie lo ve a él.','Antes de cada ronda, uma roleta gira na tela: cartões de jogadores com skins e nomes, e o destaque cinza listrado escolhe o procurador. As chances mudam a cada ronda, quem buscou recentemente tem menos chance. Enquanto todos se escondem, o procurador não vê ninguém — e ninguém o vê.','Przed każdą rundą na ekranie kręci się ruletka: karty graczy ze skinami i nickami, a szare pasy wybierają szukającego. Szanse zmieniają się co rundę, niedawni szukający mają mniejszą szansę. Dopóki wszyscy się chowają, szukający nikogo nie widzi — i nikt nie widzi jego.','Her turdan önce ekranda bir çark döner: skinli ve isimli oyuncu kartları, gri çizgili seçim arayanı belirler. Şanslar her turda değişir, yakın zamanda arayanların şansı daha düşüktür. Herkes saklanırken arayan kimseyi göremez — kimse onu göremez.','每回合开始前屏幕上会转动轮盘：带有皮肤和昵称的玩家卡片，灰色条纹高亮会选出寻找者。概率每回合都不同，最近当过寻找者的人概率更低。躲藏期间寻找者看不见任何人——也没人看得见他。'],
    hsRule1:      ['Искателя выбирает рулетка в начале каждого раунда — шансы каждый раз новые.','The roulette picks the seeker at the start of each round — the odds are new every time.','Шукача обирає рулетка на початку кожного раунду — шанси щоразу нові.','Das Glücksrad wählt den Sucher zu Beginn jeder Runde — die Chancen sind jedes Mal neu.','La roulette choisit le chercheur au début de chaque manche — les chances changent à chaque fois.','La ruleta elige al buscador al inicio de cada ronda — las probabilidades son nuevas cada vez.','A roleta escolhe o procurador no início de cada ronda — as chances são novas a cada vez.','Ruletka wybiera szukającego na początku każdej rundy — szanse za każdym razem nowe.','Çark her turun başında arayanı seçer — şanslar her seferinde yenilenir.','每回合开始时由轮盘选出寻找者——概率每次都是新的。'],
    hsRule2:      ['Во время прятаний искатель не видит прячущихся, прячущиеся не видят искателя.','While everyone hides, the seeker cannot see the hiders, and the hiders cannot see the seeker.','Поки ховаються, шукач не бачить тих, хто ховається, а вони не бачать шукача.','Während sich alle verstecken, sieht der Sucher die Versteckenden nicht — und umgekehrt.','Pendant que tous se cachent, le chercheur ne voit pas les cachés, et les cachés ne voient pas le chercheur.','Mientras todos se esconden, el buscador no ve a los que se esconden, y ellos no lo ven a él.','Enquanto todos se escondem, o procurador não vê os escondidos, e eles não o veem.','Dopóki wszyscy się chowają, szukający nie widzi chowających się, a oni nie widzą jego.','Herkes saklanırken arayan saklananları göremez, saklananlar da arayanı göremez.','躲藏阶段寻找者看不见躲藏者，躲藏者也看不见寻找者。'],
    hsRule3:      ['После начала раунда все видят всех — начинается охота.','Once the round starts everyone sees everyone — the hunt begins.','Після початку раунду всі бачать усіх — починається полювання.','Sobald die Runde beginnt, sehen sich alle — die Jagd beginnt.','Quand la manche commence, tout le monde voit tout le monde — la chasse commence.','Cuando empieza la ronda, todos ven a todos — comienza la caza.','Quando a ronda começa, todos veem todos — a caça começa.','Gdy runda się zacznie, wszyscy widzą wszystkich — zaczyna się polowanie.','Tur başladığında herkes herkesi görür — av başlar.','回合开始后所有人互相可见——狩猎开始。'],
    hsRule4:      ['Пойманный меняет цвет и помогает искать остальных.','A caught player changes colour and helps seek the rest.','Спійманий змінює колір і допомагає шукати інших.','Gefangene wechseln die Farbe und helfen, die anderen zu suchen.','Un attrapé change de couleur et aide à chercher les autres.','Un atrapado cambia de color y ayuda a buscar a los demás.','Um apanhado muda de cor e ajuda a procurar os outros.','Złapany zmienia kolor i pomaga szukać pozostałych.','Yakalanan rengini değiştirir ve diğerlerini aramaya yardım eder.','被抓住的人会变色并帮忙寻找其他人。'],
    hsRule5:      ['Карту выбирает сервер из тех, что добавил разработчик.','The server picks the map from the ones the developer added.','Карту обирає сервер з тих, що додав розробник.','Der Server wählt die Karte aus den vom Entwickler hinzugefügten.','Le serveur choisit la carte parmi celles ajoutées par le développeur.','El servidor elige el mapa entre los que añadió el desarrollador.','O servidor escolhe o mapa entre os que o desenvolvedor adicionou.','Serwer wybiera mapę z tych, które dodał twórca.','Sunucu, geliştiricinin eklediği haritalardan birini seçer.','服务器从开发者添加的地图中选择。'],
    hsRule6:      ['Хорошее укрытие — не самое дальнее, а самое неочевидное.','A good hiding spot is not the farthest, but the least obvious.','Гарне укриття — не найвіддаленіше, а найнесподіваніше.','Ein gutes Versteck ist nicht das entfernteste, sondern das unscheinbarste.','Une bonne cachette n\'est pas la plus lointaine, mais la moins évidente.','Un buen escondite no es el más lejano, sino el menos obvio.','Um bom esconderijo não é o mais distante, mas o menos óbvio.','Dobra kryjówka nie jest najdalsza, lecz najmniej oczywista.','İyi bir saklanma yeri en uzağı değil, en beklenmedik olanıdır.','好的藏身处不是最远的，而是最不显眼的。'],
    modeRaceText: ['Все стартуют одновременно и бегут к финишу. Побеждает тот, кто первым коснётся флага — но дорога к нему редко бывает прямой.','Everyone starts at once and runs for the finish. The first to touch the flag wins — but the way there is rarely straight.','Усі стартують одночасно і біжать до фінішу. Перемагає той, хто першим торкнеться прапора — але шлях до нього рідко буває прямим.','Alle starten gleichzeitig und rennen ins Ziel. Gewinnt, wer zuerst die Fahne berührt — der Weg dorthin ist selten gerade.','Tous partent en même temps et courent vers l\'arrivée. Le premier à toucher le drapeau gagne — mais le chemin y est rarement direct.','Todos arrancan a la vez y corren a la meta. Gana quien toque primero la bandera — pero el camino rara vez es directo.','Todos largam ao mesmo tempo e correm para a chegada. Vence quem tocar primeiro na bandeira — mas o caminho raramente é reto.','Wszyscy startują razem i biegną do mety. Wygrywa ten, kto pierwszy dotknie flagi — ale droga rzadko jest prosta.','Herkes aynı anda başlar ve bitişe koşar. Bayrağa önce dokunan kazanır — ama yol çoğu zaman düz değildir.','所有人同时起跑奔向终点。先碰到旗帜者获胜——但路很少是直的。'],
    raceRule1:    ['Шипы и яд возвращают на последний чекпоинт, а не в начало.','Spikes and poison send you back to the last checkpoint, not the start.','Шипи й отрут повертають на останній чекпоінт, а не на початок.','Stacheln und Gift bringen dich zum letzten Checkpoint, nicht zum Anfang.','Les piques et le poison renvoient au dernier checkpoint, pas au début.','Las púas y el veneno te devuelven al último checkpoint, no al inicio.','Espinhos e veneno levam ao último checkpoint, não ao início.','Kolce i jad wracają na ostatni checkpoint, a nie na start.','Dikenler ve zehir başa değil son kontrol noktasına döndürür.','尖刺和毒液会把你送回最近的检查点，而不是起点。'],
    raceRule2:    ['Батуты забрасывают выше, чем достаёт обычный прыжок.','Trampolines throw you higher than a regular jump reaches.','Батути закидають вище, ніж дістає звичайний стрибок.','Trampoline schleudern dich höher als ein normaler Sprung reicht.','Les trampolines propulsent plus haut qu\'un saut normal.','Los trampolines te lanzan más alto que un salto normal.','Os trampolins lançam mais alto que um pulo normal.','Trampoliny wyrzucają wyżej, niż sięga zwykły skok.','Trambolinler normal zıplamadan daha yükse fırlatır.','蹦床把你弹得比普通跳跃更高。'],
    raceRule3:    ['Платформы и ротаторы движутся — иногда выгоднее подождать.','Platforms and rotators move — sometimes it pays to wait.','Платформи і ротори рухаються — іноді вигідніше зачекати.','Plattformen und Rotatoren bewegen sich — manchmal ist Warten klüger.','Plateformes et rotateurs bougent — parfois mieux vaut attendre.','Las plataformas y rotores se mueven — a veces conviene esperar.','As plataformas e rotores se movem — às vezes é melhor esperar.','Platformy i rotatory się ruszają — czasem lepiej poczekać.','Platformlar ve döndürücüler hareket eder — bazen beklemek akıllıcadır.','平台和旋转体会移动——有时等待更明智。'],
    raceRule4:    ['Монеты разбросаны в стороне от быстрого пути: решайте, стоят ли они времени.','Coins are scattered off the fast route: decide whether they are worth the time.','Монети розкидані осторонь від швидкого шляху: вирішуйте, чи варті вони часу.','Münzen liegen abseits der schnellen Route: entscheide, ob sie die Zeit wert sind.','Les pièces sont éparpillées hors du trajet rapide : à toi de voir si elles valent le temps.','Las monedas están lejos de la ruta rápida: decide si valen el tiempo.','As moedas estão longe do caminho rápido: decida se valem o tempo.','Monety leżą z dala od szybkiej trasy: zdecyduj, czy warte są czasu.','Jetonlar hızlı rotanın uzağında: zamana değer mi karar ver.','金币散落在快速路线之外：自己权衡是否值得花时间。'],
    raceRule5:    ['Время круга видно на экране, свой рекорд можно побить на той же карте.','Your lap time is on screen — beat your own record on the same map.','Час кола видно на екрані, свій рекорд можна побити на тій самій карті.','Die Rundenzeit steht auf dem Bildschirm — auf derselben Karte kannst du rekord jagen.','Le temps du tour est à l\'écran — bats ton record sur la même carte.','El tiempo de vuelta se ve en pantalla — bate tu récord en el mismo mapa.','O tempo da volta aparece na tela — bata seu recorde no mesmo mapa.','Czas okrążenia widać na ekranie — bij własny rekord na tej samej mapie.','Tur süresi ekranda — aynı haritada rekorunu kırabilirsin.','屏幕上会显示单圈时间——可以在同一张地图上挑战自己的纪录。'],
    mdBack:       ['На главную','Back to main','На головну','Zur Startseite','Retour à l\'accueil','Al inicio','Para o início','Na stronę główną','Ana sayfaya','返回主页'],

    /* ---------- новости, лидеры, прочее ---------- */
    logsSub:      ['Обновления и объявления AIBrofist','AIBrofist updates and announcements','Оновлення та оголошення AIBrofist','AIBrofist-Updates und Ankündigungen','Mises à jour et annonces AIBrofist','Novedades y anuncios de AIBrofist','Novidades e anúncios do AIBrofist','Aktualizacje i ogłoszenia AIBrofist','AIBrofist güncellemeleri ve duyuruları','AIBrofist 更新与公告'],
    addImages:    ['Добавить изображения','Add images','Додати зображення','Bilder hinzufügen','Ajouter des images','Añadir imágenes','Adicionar imagens','Dodaj obrazy','Resim ekle','添加图片'],
    dropHint:     ['перетащите файлы сюда или вставьте из буфера (Ctrl+V) — до 8 штук','drag files here or paste from clipboard (Ctrl+V) — up to 8','перетягніть файли сюди або вставте з буфера (Ctrl+V) — до 8 штук','Dateien hierher ziehen oder einfügen (Strg+V) — bis zu 8','glissez des fichiers ici ou collez (Ctrl+V) — jusqu\'à 8','arrastra archivos aquí o pega del portapapeles (Ctrl+V) — hasta 8','arraste arquivos aqui ou cole da área de transferência (Ctrl+V) — até 8','przeciągnij pliki tutaj lub wklej (Ctrl+V) — do 8 sztuk','dosyaları buraya sürükle veya yapıştır (Ctrl+V) — en fazla 8','拖拽文件到此处或从剪贴板粘贴（Ctrl+V）——最多 8 张'],
    publishBtn:   ['Опубликовать','Publish','Опублікувати','Veröffentlichen','Publier','Publicar','Publicar','Opublikuj','Yayınla','发布'],
    noNewsYet:    ['Пока нет ни одной новости','No news yet','Поки немає жодної новини','Noch keine Neuigkeiten','Pas encore d\'actualités','Aún no hay noticias','Ainda não há notícias','Jeszcze nie ma aktualności','Henüz haber yok','还没有任何新闻'],
    loadFailed:   ['Не удалось загрузить','Failed to load','Не вдалося завантажити','Laden fehlgeschlagen','Échec du chargement','No se pudo cargar','Falha ao carregar','Nie udało się wczytać','Yüklenemedi','加载失败'],
    delNewsAsk:   ['Удалить новость?','Delete this post?','Видалити новину?','Beitrag löschen?','Supprimer cette actualité ?','¿Eliminar esta noticia?','Excluir esta notícia?','Usunąć aktualność?','Haberi sil?','删除这条新闻？'],
    kbUnit:       [' КБ',' KB',' КБ',' KB',' Ko',' KB',' KB',' KB',' KB',' KB'],
    kbLoaded:     ['загружено','uploaded','завантажено','geladen','chargé','subida','enviada','wgrano','yüklendi','已上传'],
    lbSub:        ['Топ 10 по собранным монетам · обновляется автоматически','Top 10 by coins collected · updates automatically','Топ 10 за зібраними монетами · оновлюється автоматично','Top 10 nach gesammelten Münzen · automatisch aktualisiert','Top 10 par pièces collectées · mis à jour automatiquement','Top 10 por monedas recogidas · se actualiza automáticamente','Top 10 por moedas coletadas · atualiza automaticamente','Top 10 według zebranych monet · aktualizuje się automatycznie','Toplanan jetona göre ilk 10 · otomatik güncellenir','收集金币前 10 名 · 自动更新'],
    lbEmpty:      ['Пока никто не собрал ни одной монеты','Nobody has collected any coins yet','Поки ніхто не зібрав жодної монети','Noch hat niemand Münzen gesammelt','Personne n\'a encore collecté de pièces','Nadie ha recogido monedas todavía','Ninguém coletou moedas ainda','Nikt jeszcze nie zebrał monet','Henüz kimse jeton toplamadı','还没有人收集到金币'],
    signForCoins: ['Войди в аккаунт, чтобы монеты сохранялись','Sign in so your coins are saved','Увійди в акаунт, щоб монети зберігалися','Melde dich an, damit Münzen gespeichert werden','Connecte-toi pour que tes pièces soient gardées','Inicia sesión para que se guarden tus monedas','Inicie sessão para guardar suas moedas','Zaloguj się, aby monety się zapisywały','Jetonların kaydedilmesi için giriş yap','登录后金币才会保存'],
    joinedWord:   [' зашёл',' joined',' зайшов',' ist beigetreten',' a rejoint',' se unió',' entrou',' dołączył',' katıldı',' 加入了'],
    leftWord:     [' вышел',' left',' вийшов',' hat verlassen',' est parti',' se fue',' saiu',' wyszedł',' ayrıldı',' 离开了'],
    ownerFab:     ['Ред','Edit','Ред','Bearb','Éditer','Editar','Editar','Edytuj','Düzenle','编辑'],
    phTitle:      ['Заголовок','Title','Заголовок','Titel','Titre','Título','Título','Tytuł','Başlık','标题'],
    phNewsText:   ['Текст новости','Post text','Текст новини','Beitragstext','Text de l\'actualité','Texto de la noticia','Texto da notícia','Treść aktualności','Haber metni','新闻正文'],
    lbPlaceN:     ['Ты на {n} месте · {t} монет','You are #{n} · {t} coins','Ти на {n} місці · {t} монет','Du bist auf Platz {n} · {t} Münzen','Tu es {n}e · {t} pièces','Estás en el puesto {n} · {t} monedas','Estás no {n}º lugar · {t} moedas','Jesteś na {n}. miejscu · {t} monet','{n}. sıradasin · {t} jeton','你排在第 {n} 名 · {t} 金币'],
    lbYouHave:    ['У тебя {t} монет','You have {t} coins','У тебе {t} монет','Du hast {t} Münzen','Tu as {t} pièces','Tienes {t} monedas','Tem {t} moedas','Masz {t} monet','{t} jetonun var','你有 {t} 金币']
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
    'Two Player Adventure': 'twoPlayer', 'Hide And Seek': 'hideAndSeek',
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
    'Mode: Two Player Adventure': 'twoPlayer', 'Mode: Hide And Seek': 'hideAndSeek',
    'Mode: Race': 'race', 'Two Player Adventure': 'twoPlayer',
    'Hide and Seek': 'hideAndSeek', 'Sandbox': 'sandbox', 'Race': 'race',
    'Таблица лидеров': 'leaderboard', 'Новости': 'logs', 'Настройки': 'settings',
    'Мой профиль': 'viewProfile', 'Выйти': 'logout', 'Войти': 'signin',
    'Вход или регистрация': 'signInOrUp', 'Войти в аккаунт': 'loginAcc',
    'Создать аккаунт': 'createAcc', 'Гость': 'guest', 'Загрузка…': 'loading'
  };

  var lang = 'en';
  var idx = 1;

  function t(key) {
    var row = D[key];
    if (!row) return key;
    return row[idx] || row[0];
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

  // подмена текстов, которые рисует чужой код
  function autoText(root) {
    // hasOwnProperty: короткий текст вроде "constructor"/"toString" иначе
    // резолвится через прототип в унаследованную функцию, а не в undefined,
    // и D[...][0] на ней рвёт весь проход по DOM с TypeError
    var has = Object.prototype.hasOwnProperty;
    if (lang === 'ru') {
      // русский — переводим только английские подписи вендора
      walk(root, function (s) {
        return has.call(AUTO, s) && D[AUTO[s]][0] !== s ? t(AUTO[s]) : null;
      });
      return;
    }
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

  /* ---------- уточнение по часовому поясу (бесплатно, без сети) ---------- */
  var TZ = {
    'Europe/Moscow': 'ru', 'Europe/Samara': 'ru', 'Asia/Yekaterinburg': 'ru',
    'Asia/Novosibirsk': 'ru', 'Asia/Krasnoyarsk': 'ru', 'Asia/Irkutsk': 'ru',
    'Asia/Vladivostok': 'ru', 'Europe/Minsk': 'ru', 'Asia/Almaty': 'ru',
    'Europe/Kiev': 'uk', 'Europe/Kyiv': 'uk',
    'Europe/Berlin': 'de', 'Europe/Vienna': 'de', 'Europe/Zurich': 'de',
    'Europe/Paris': 'fr', 'Europe/Brussels': 'fr',
    'Europe/Madrid': 'es', 'America/Mexico_City': 'es', 'America/Bogota': 'es',
    'America/Argentina/Buenos_Aires': 'es', 'America/Santiago': 'es', 'America/Lima': 'es',
    'Europe/Lisbon': 'pt', 'America/Sao_Paulo': 'pt',
    'Europe/Warsaw': 'pl', 'Europe/Istanbul': 'tr',
    'Asia/Shanghai': 'zh', 'Asia/Taipei': 'zh', 'Asia/Hong_Kong': 'zh'
  };
  function guess() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (TZ[tz]) return TZ[tz];
    } catch (e) {}
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    var base = String(nav).toLowerCase().split('-')[0];
    if (LANGS.indexOf(base) !== -1) return base;
    if (['be', 'kk', 'ky', 'uz', 'hy', 'az'].indexOf(base) !== -1) return 'ru';
    return 'en';
  }

  function setLang(next, silent) {
    if (LANGS.indexOf(next) === -1) next = 'en';
    lang = next;
    idx = LANGS.indexOf(next);
    document.documentElement.setAttribute('lang', next);
    applyTo(document.body || document.documentElement);
    // чужие скрипты рисуют интерфейс с задержкой — добираем их
    setTimeout(function () { applyTo(document.body || document.documentElement); }, 250);
    setTimeout(function () { applyTo(document.body || document.documentElement); }, 900);
    if (!silent) {
      try { localStorage.setItem('bfLang', next); } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('bf-lang', { detail: { lang: next } }));
  }

  function save(next) {
    var body = 'lang=' + encodeURIComponent(next);
    fetch('/i18n/set', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body
    }).catch(function () {});
    if (next === 'auto') { try { localStorage.removeItem('bfLang'); } catch (e) {} setLang(guess()); }
    else setLang(next);
  }

  /* ---------- старт ---------- */
  function boot() {
    var cached = null;
    try { cached = localStorage.getItem('bfLang'); } catch (e) {}
    if (cached && LANGS.indexOf(cached) !== -1) { setLang(cached, true); return; }

    /* база — английский; автодетект по стране больше не включаем.
       Применяем ТОЛЬКО язык, сохранённый игроком в аккаунте (Settings). */
    setLang('en', true);

    fetch('/i18n/detect', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.saved && d.lang && LANGS.indexOf(d.lang) !== -1) setLang(d.lang, true);
      })
      .catch(function () {});

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
    t: t, apply: applyTo, set: save, langs: LANGS, names: NAMES,
    get current() { return lang; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
