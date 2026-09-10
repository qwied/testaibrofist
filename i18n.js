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
    hideAndSeek:  ['Прятки','Hide and Seek','Хованки','Verstecken','Cache-cache','Escondite','Esconde-esconde','Chowany','Saklambaç','捉迷藏'],
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
    skinPlain:    ['Без аксессуаров','No accessories','Без аксесуарів','Ohne Accessoires','Sans accessoires','Sin accesorios','Sem acessórios','Bez akcesoriów','Aksesuarsız','无配饰'],
    skinImage:    ['Скин-картинка','Picture skin','Скін-картинка','Bild-Skin','Skin image','Skin de imagen','Skin de imagem','Skin obrazkowy','Resim görünümü','图片皮肤'],
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
    lbYouHave:    ['У тебя {t} монет','You have {t} coins','У тебе {t} монет','Du hast {t} Münzen','Tu as {t} pièces','Tienes {t} monedas','Tem {t} moedas','Masz {t} monet','{t} jetonun var','你有 {t} 金币'],

    /* ---------- каталог скинов: названия деталей (голова/тело) ---------- */
    skin_h_none:  ['Ничего','None','Нічого','Nichts','Aucun','Ninguno','Nenhum','Nic','Yok','无'],
    skin_b_none:  ['Ничего','None','Нічого','Nichts','Aucun','Ninguno','Nenhum','Nic','Yok','无'],
    skin_h_wizard: ['Колпак звездочёта','Stargazer Hood','Зоряний капот','Stargazer Kapuzenpulli','Sweat à capuche Stargazer','Capucha Stargazer','Capuz Stargazer','Kaptur Stargazer','Yıldız Falcısı Başlığı','观星者兜帽'],
    skin_h_viking: ['Рогатый шлем','Horned Helmet','Рогатий шолом','Gehörnter Helm','Casque à cornes','Casco con cuernos','Capacete com Chifres','Kask z rogami','Boynuzlu Miğfer','角盔'],
    skin_h_king:  ['Золотая корона','Golden Crown','Золота Корона','Goldene Krone','Couronne d\'or','Corona Dorada','Coroa Dourada','Złota korona','Altın Taç','金色王冠'],
    skin_h_pharaoh: ['Убор фараона','Pharaoh\'s Garb','Одяг фараона','Pharaos Gewand','Tenue de pharaon','El atuendo del faraón','Traje do faraó','Szata faraona','Firavun\'un kıyafeti','法老的衣服'],
    skin_h_dots:  ['Бант в горошек','Polka Dot Bow','Бант в горошок','Gepunktete Schleife','Nœud à pois','Lazo de lunares','Laço de Bolinhas','Łuk w kropki','Puantiyeli Yay','波点蝴蝶结'],
    skin_h_phoenix: ['Голова феникса','Phoenix Head','Фенікс-Хед','Phönixkopf','Tête de Phénix','Cabeza de Fénix','Cabeça de Fênix','Głowa Feniksa','Anka Kuşu Baş','Phoenix Head'],
    skin_h_lepre: ['Цилиндр лепрекона','Leprechaun Top Hat','Циліндр лепрекона','Koboldzylinder','Leprechaun Cylinder','Cilindro del Leprechaun','Cilindro do Leprechaun','Cylinder skrzata','Leprikon Silindiri','妖精气缸'],
    skin_h_skater: ['Патлы и очки','Shaggy Hair & Glasses','Патчі та окуляри','Aufnäher & Schutzbrillen','Patchs et lunettes','Parches y gafas','Patches e óculos de proteção','Naszywki i gogle','Yamalar ve Gözlükler','贴片和护目镜'],
    skin_h_artist: ['Художественный берет','Artist\'s Beret','Берет художника','Künstlerbarett','Béret d\'artiste','Boina de artista','Boina de artista','Beret artysty','Ressam Beresi','艺术家贝雷帽'],
    skin_h_emerald: ['Зелёная шляпа','Green Hat','Зелений капелюх','Grüner Hut','Chapeau vert','Sombrero verde','Chapéu Verde','Zielony kapelusz','Yeşil Şapka','绿色帽子'],
    skin_h_candle: ['Огонёк свечи','Candle Light','Свічка','Kerzenlicht','Lampe à bougie','Luz de la vela','Luz de vela','Światło świecy','Mum ışığı','蜡烛灯'],
    skin_h_paint: ['Мазки краски','Paint Strokes','Мазки фарби','Pinselstriche','Coups de peinture','Trazos de pintura','Traços de tinta','Uderzenia farby','Boya vuruşları','绘画笔触'],
    skin_h_shade: ['Рогатая тень','Horned Shadow','Рогата тінь','Hornschatten','Ombre à cornes','Sombra con cuernos','Sombra com Chifres','Rogaty Cień','Boynuzlu Gölge','角影'],
    skin_h_smile: ['Смайлик в очках','Glasses Smiley','Окуляри смайлик','Smiley-Brille','Lunettes smiley','Gafas sonrientes','Copos smiley','Okulary Smiley','Gözlüklü gülen yüz','眼镜笑脸'],
    skin_h_green_pl: ['Зелёная кепка','Green Cap','Зелена кришка','Grüne Kappe','Casquette verte','Gorra verde','Tampa verde','Zielona czapka','Yeşil kapak','绿色帽子'],
    skin_h_lady:  ['Шляпка с цветами','Hat with Flowers','Шляпка с цветами','Hut mit Blumen','Chapeau avec fleurs','Sombrero con flores','Chapéu com flores','Kapelusz Z kwiatami','Çiçekli şapka','戴着鲜花的帽子'],
    skin_h_bunnyhd: ['Капюшон-зайчик','Bunny Hood','Капюшон зайчика','Hasenhaube','Sweat à capuche Bunny','Capucha de conejito','Capuz de coelho','Kaptur króliczka','Tavşan Başlığı','兔兜帽'],
    skin_h_red_pl: ['Красная кепка','Red Cap','Червона кришка','Rote Kappe','Casquette rouge','Gorra roja','Boné vermelho','Czerwona nakładka','Kırmızı Başlık','红色帽子'],
    skin_h_deer:  ['Глаз с рогами','Eye with Horns','Око з рогами','Auge mit Hörnern','Œil avec cornes','Ojo con cuernos','Olho com chifres','Oko z rogami','Boynuzlu göz','有角的眼睛'],
    skin_h_skier: ['Лыжная маска','Ski Mask','Лижна маска','Skimaske','Masque de ski','Pasamontañas','Máscara de esqui','Maska narciarska','Kayak Maskesi','滑雪面罩'],
    skin_h_crimson: ['Багровая голова','Crimson Head','Багряна голова','Purpurroter Kopf','Tête Pourpre','Cabeza Carmesí','Cabeça Carmesim','Karmazynowa Głowa','Kızıl Kafa','绯红头'],
    skin_h_frost: ['Шлем ледяного стража','Ice Guard Helmet','Льодовий захисний шолом','Eisschutzhelm','Casque de protection contre les glaces','Casco de guardia de hielo','Capacete de Guarda de Gelo','Hełm Strażnika Lodu','Buz Muhafızı Miğferi','护冰头盔'],
    skin_h_totem: ['Деревянный тотем','Wooden Totem','Дерев \'яний тотем','Holz-Totem','Totem en bois','Tótem de madera','Totem de Madeira','Drewniany totem','Ahşap Totem','木图腾'],
    skin_h_azure: ['Голова лазурного зверя','Azure Beast Head','Голова блакитного звіра','Der Kopf des azurblauen Tieres','La tête de la bête d\'azur','La cabeza de la bestia azul','A cabeça da besta azul','Głowa lazurowej bestii','Gök mavisi canavarın başı','青兽之首'],
    skin_h_nomad: ['Красная повязка','Red Headband','Червона пов \'язка','Roter Verband','Pansement rouge','Apósito rojo','Molho vermelho','Opatrunek czerwony','Kırmızı pansuman','红色敷料'],
    skin_h_elkwar: ['Шлем с рогами лося','Horned Helmet','Шолом з лосячими рогами','Helm mit Elchhörnern','Casque avec cornes de wapiti','Casco con cuernos de alce','Capacete com chifres de alce','Hełm z rogami łosia','Geyik boynuzlu kask','麋鹿角头盔'],
    skin_h_chief: ['Маска вождя','Chief\'s Mask','Маска начальника','Häuptlingsmaske','Masque de chef','Máscara del jefe','Máscara do Chefe','Maska wodza','Şefin Maskesi','酋长面具'],
    skin_h_owl:   ['Морда совы','Owl Face','Морда сови','Eulenschnauze','Museau de hibou','Hocico de búho','Focinho de coruja','Pysk sowy','Baykuş burnu','猫头鹰鼻子'],
    skin_h_furry: ['Мохнатая маска','Shaggy Mask','Мохната маска','Zottelige Maske','Masque Shaggy','Máscara Peluda','Máscara Salsicha','Kudłata maska','Tüylü Maske','毛茸茸的面具'],
    skin_h_moth1: ['Голова мотылька','Moth Head','Голова молі','Mottenkopf','Tête de papillon','Cabeza de polilla','Cabeça de Mariposa','Głowica ćmy','Güve Başı','飞蛾头'],
    skin_h_rabbit: ['Мордочка кролика','Rabbit Face','Обличчя кролика','Kaninchengesicht','Visage de lapin','Cara de conejo','Cara de coelho','Królicza twarz','Tavşan surat','兔脸'],
    skin_h_puppy: ['Мордочка пёсика','Doggie Muzzle','Намордник з собачкою','Hundemaulkorb','Museau de Chiot','Hocico de perrito','Focinho de Cachorrinho','Kaganiec dla psa','Köpek Ağzı','Doggie Muzzle'],
    skin_h_catninja: ['Шлем кота-ниндзя','Cat Ninja Helmet','Шолом кішки-ніндзя','Katzen-Ninja-Helm','Casque Cat Ninja','Casco de gato ninja','Capacete Ninja para Gatos','Kask Cat Ninja','Kedi Ninja Miğferi','猫忍者头盔'],
    skin_h_reaper: ['Маска белого жнеца','White Reaper Mask','Біла маска "Жнець"','Weiße Schnittermaske','Masque faucheur blanc','Máscara de segadora blanca','Máscara Ceifadora Branca','Biała maska żniwiarza','Beyaz Azrail Maskesi','白色收割者面具'],
    skin_h_moth2: ['Усики мотылька','Moth Tendrils','Усики молі','Mottenranken','Vrilles de papillon de nuit','Zarcillos de polilla','Gavinhas de mariposa','Wąsy ćmy','Güve dalları','蛾卷须'],
    skin_h_bluewolf: ['Голова синего волка','Blue Wolf Head','Голова синього вовка','Blauer Wolfskopf','Tête de loup bleue','Cabeza de lobo azul','Cabeça de Lobo Azul','Głowa Niebieskiego Wilka','Mavi Kurt Kafası','蓝狼头'],
    skin_h_raven: ['Морда ворона','Raven Face','Морда ворони','Maulkorb einer Krähe','Museau d\'un corbeau','Hocico de cuervo','Focinho de um corvo','Kaganiec wrony','Bir karganın ağzı','乌鸦嘴'],
    skin_h_sailor: ['Красная бандана','Red Bandana','Червона бандана','Rotes Halstuch','Bandana rouge','Bandana roja','Bandana vermelha','Czerwona bandana','Kırmızı Bandana','红色头巾'],
    skin_h_pirate: ['Пиратская треуголка','Pirate Tricorn','Піратський трикутник','Piratendreieck','Triangle Pirate','Triángulo pirata','Triângulo Pirata','Kapelusz piracki','Korsan Üçgeni','海盗三角'],
    skin_h_bonedrag: ['Череп дракона','Dragon Skull','Череп дракона','Drachenschädel','Crâne de dragon','Cráneo de dragón','Caveira de Dragão','Smocza Czaszka','Ejderha Kafatası','龙骷髅'],
    skin_h_prince: ['Золотая диадема','Golden Tiara','Золота тіара','Goldene Tiara','Diadème Doré','Tiara dorada','Tiara Dourada','Złoty diadem','Altın Taç','金色头饰'],
    skin_h_clown: ['Клоунский парик','Clown Wig','Перука клоуна','Clownperücke','Perruque clown','Peluca de payaso','Peruca de palhaço','Peruka klauna','Palyaço peruğu','小丑假发'],
    skin_h_vampire: ['Чёрный цилиндр','Black Top Hat','Чорний циліндр','Schwarzer Zylinder','Cylindre noir','Cilindro negro','Cilindro preto','Czarny cylinder','Siyah silindir','黑色圆柱体'],
    skin_h_priest: ['Венок жреца','Priest\'s Wreath','Вінок священика','Priesterkranz','Couronne du prêtre','Corona del sacerdote','Coroa do Sacerdote','Wieniec księdza','Papaz Çelenkleri','祭司花圈'],
    skin_h_forest: ['Багряная корона','Crimson Crown','Багряная корона','Purpurrote Krone','Couronne cramoisie','Corona carmesí','Coroa carmesim','Szkarłatna korona','Kızıl taç','深红色皇冠'],
    skin_h_glitch: ['Глитч-голова','Glitch Head','Головка збою','Störkopf','Tête Glitch','Cabeza Glitch','Cabeça de Falha','Usterka głowicy','Glitch Kafası','Glitch Head'],
    skin_h_sunset: ['Оранжевый шар','Orange Balloon','Помаранчева куля','Orangefarbener Ball','Ballon orange','Globo naranja','Balão laranja','Pomarańczowy balon','Turuncu balon','橙色气球'],
    skin_h_popit: ['Радужный поп-ит','Rainbow Pop-It','Веселковий Поп-іт','Regenbogen-Pop-It','Pop-It Arc-en-ciel','Pop-It Arcoíris','Pop-It Arco-íris','Tęczowy Pop-It','Rainbow Pop - It','Rainbow Pop-It'],
    skin_h_toxic: ['Знак радиации','Radiation Sign','Радіаційна ознака','Strahlenzeichen','Signe de rayonnement','Signo de radiación','Sinal de radiação','Objaw radiacyjny','Radyasyon işareti','辐射标志'],
    skin_h_nerd:  ['Смайлик-ботаник','Nerdy Smiley','Усміхнений ботанік','Smiley-Botaniker','Botaniste Smiley','Botánico sonriente','Botânico sorridente','Uśmiechnięty botanik','Gülen botanikçi','笑脸植物学家'],
    skin_h_shards: ['Осколки стекла','Glass Shards','Осколки стекла','Glassplitter','Éclats de verre','Fragmentos de vidrio','Cacos de vidro','Odłamki szkła','Cam kırıkları','玻璃碎片'],
    skin_h_aqua:  ['Крышка аквариума','Aquarium Cover','Чохол для акваріума','Aquarienabdeckung','Couverture d\'aquarium','Cubierta del acuario','Tampa do aquário','Pokrowiec do akwarium','Akvaryum kapağı','水族箱盖'],
    skin_h_wire:  ['Каркас головы','Head Frame','Каркас головы','Kopfrahmen','Headframe','Headframe','Estrutura principal','Rama czołowa','Headframe','头架'],
    skin_h_dashed: ['Пунктирная голова','Dotted Head','Пунктирна голова','Gepunkteter Kopf','Tête pointillée','Cabezal punteado','Cabeça pontilhada','Kropkowana głowa','Noktalı Kafa','点状头部'],
    skin_h_pastel: ['Пастельные цветы','Pastel Flowers','Пастельні квіти','Pastellblumen','Fleurs pastel','Flores pastel','Flores pastel','Pastelowe kwiaty','Pastel Çiçekler','粉彩花卉'],
    skin_h_fox:   ['Мордочка лиса','Fox Face','Обличчя лисиці','Fuchsgesicht','Visage de renard','Cara de zorro','Cara de raposa','Twarz lisa','Tilki surat','狐脸'],
    skin_h_slasher: ['Хоккейная маска','Hockey Mask','Хокейна маска','Hockey-Maske','Masque de hockey','Máscara de hockey','Máscara de hóquei','Maska hokejowa','Hokey Maskesi','曲棍球面具'],
    skin_h_beach: ['Соломенная макушка','Straw Crown','Корона з соломи','Strohkrone','Couronne de paille','Corona de paja','Coroa de palha','Korona ze słomy','Hasır taç','稻草王冠'],
    skin_h_cat:   ['Мордочка кота','Cat Face','Обличчя кота','Katzengesicht','Visage de chat','Cara de gato','Cara de gato','Twarz kota','Kedi yüzü','猫脸'],
    skin_h_zombie: ['Голова зомби','Zombie Head','Голова зомбі','Zombiekopf','Tête de zombie','Cabeza de zombi','Cabeça de Zumbi','Głowa zombie','Zombi Kafası','僵尸头'],
    skin_h_mummy: ['Бинты на голове','Head Bandages','Пов \'язки на голову','Stirnbänder','Bandeaux','Cintas para la cabeza','Fitas para a cabeça','Opaski na głowę','Saç bantları','发带'],
    skin_h_crest_r: ['Багровый герб','Crimson Coat of Arms','Багряний герб','Purpurrotes Wappen','Armoiries pourpres','Escudo de armas carmesí','Brasão de armas carmesim','Karmazynowy herb','Kızıl arma','深红色纹章'],
    skin_h_crest_f: ['Огненный герб','Fire Coat of Arms','Вогняний герб','Feuerwappen','Armoiries coupe-feu','Escudo de fuego','Brasão de Fogo','Herb Ognia','Ateş Arması','消防徽章'],
    skin_h_check: ['Зелёная галочка','Green Checkmark','Зелена галочка','Grünes Häkchen','Coche verte','Marca de verificación verde','Marca de verificação verde','Zielony znacznik wyboru','Yeşil onay işareti','绿色复选标记'],
    skin_b_wizard: ['Звёздная мантия','Star Mantle','Звёздная мантия','Sternmantel','Manteau étoilé','Manto estelar','Manto Estelar','Gwiezdny płaszcz','Yıldız Mantosu','星斗篷'],
    skin_b_viking: ['Боевая секира','War Axe','Бойова сокира','Kriegsaxt','Hache de guerre','Hacha de guerra','Machado de Guerra','Topór bojowy','Savaş Baltası','战斧'],
    skin_b_king:  ['Королевская мантия','Royal Mantle','Королівська мантія','Königlicher Mantel','Manteau royal','Manto real','Manto real','Płaszcz królewski','Asil manto','皇家斗篷'],
    skin_b_pharaoh: ['Пояс фараона','Pharaoh\'s Belt','Пояс фараона','Gürtel des Pharaos','Ceinture de pharaon','Cinturón del faraón','Cinturão do Faraó','Pas Faraona','Firavunun Kemeri','法老腰带'],
    skin_b_dots:  ['Сумочка в горошек','Polka Dot Handbag','Сумка в горошок','Gepunktete Handtasche','Sac à main à pois','Bolso de lunares','Bolsa de Bolinhas','Torebka w kropki','Puantiyeli El Çantası','Polka Dot手提包'],
    skin_b_phoenix: ['Огненное оперение','Fiery Plumage','Вогняне оперення','Feuriges Gefieder','Fiery plumage','Plumaje ardiente','Plumagem ardente','Ogniste upierzenie','Ateşli tüyler','火热的羽毛'],
    skin_b_lepre: ['Костюм лепрекона','Leprechaun Costume','Костюм лепрекона','Koboldanzug','Costume Leprechaun','Traje de leprechaun','Traje de duende','Kostium krasnoluda','Cüce kıyafeti','妖精套装'],
    skin_b_skater: ['Белое худи','White Hoodie','Біла пайта','Weißer Kapuzenpullover','Sweat à capuche blanc','Sudadera blanca con capucha','Casaco com capuz branco','Biała bluza z kapturem','Beyaz Kapüşonlu C','白色连帽衫'],
    skin_b_artist: ['Синий жилет','Blue Vest','Синій жилет','Blaue Weste','Gilet bleu','Chaleco azul','Colete azul','Niebieska kamizelka','Mavi Yelek','蓝色背心'],
    skin_b_emerald: ['Изумрудный смокинг','Emerald Tuxedo','Смарагдовий смокінг','Smaragd-Smoking','Smoking émeraude','Tuxedo esmeralda','Smoking Esmeralda','Szmaragdowy smoking','Zümrüt Smokin','Emerald Tuxedo'],
    skin_b_baker: ['Фартук пекаря','Baker\'s Apron','Пекарський фартух','Bäckerschürze','Tablier de boulanger','Delantal de panadero','Avental de padeiro','Fartuch piekarza','Fırıncı önlüğü','贝克围裙'],
    skin_b_candle: ['Восковая свеча','Wax Candle','Воскова свічка','Wachskerze','Bougie en cire','Vela de cera','Vela de cera','Świeca woskowa','Mum','蜡烛'],
    skin_b_paint: ['Холст художника','Painter\'s Canvas','Полотно художника','Malerleinwand','Toile de peintre','Lienzo de pintor','Tela do pintor','Płótno malarskie','Ressam Tuvali','画家画布'],
    skin_b_shade: ['Лохмотья тени','Shadow Rags','Тіньові ганчірки','Schattenlappen','Chiffons d\'ombre','Trapos de sombra','Trapos das sombras','Cieniste szmaty','Gölge paçavraları','影子抹布'],
    skin_b_smile: ['Жёлтое тело','Yellow Body','Жовте тіло','Gelber Körper','Corps jaune','Cuerpo amarillo','Corpo amarelo','Żółty korpus','Sarı gövde','黄体'],
    skin_b_green_pl: ['Зелёный комбинезон','Green Jumpsuit','Зелений комбінезон','Grüner Jumpsuit','Combinaison verte','Mono verde','Macacão Verde','Zielony kombinezon','Yeşil Tulum','绿色连体裤'],
    skin_b_lady:  ['Жёлтое платье','Yellow Dress','Жовта сукня','Gelbes Kleid','Robe jaune','Vestido amarillo','Vestido amarelo','Żółta sukienka','Sarı elbise','黄色连衣裙'],
    skin_b_bunnyhd: ['Морковка за спиной','Carrot Behind Your Back','Морква за спиною','Karotte hinter dem Rücken','La carotte dans le dos','Zanahoria a tus espaldas','Cenoura nas costas','Marchewka za plecami','Arkanızda havuç','萝卜在背后'],
    skin_b_red_pl: ['Синий комбинезон','Blue Jumpsuit','Синій комбінезон','Blauer Jumpsuit','Combinaison bleue','Mono azul','Macacão azul','Niebieski kombinezon','Mavi Tulum','蓝色连体裤'],
    skin_b_deer:  ['Белая грива','White Mane','Біла грива','Weiße Mähne','Crinière blanche','Melena blanca','Juba branca','Biała grzywa','Beyaz yele','白鬃毛'],
    skin_b_skier: ['Красный воротник','Red Collar','Червоний комір','Roter Kragen','Col rouge','Cuello rojo','Gola vermelha','Czerwony kołnierzyk','Kırmızı yaka','红领'],
    skin_b_crimson: ['Багровое тело','Crimson Body','Багряний корпус','Purpurroter Körper','Corps cramoisi','Cuerpo carmesí','Corpo carmesim','Karmazynowe ciało','Kızıl gövde','深红色的身体'],
    skin_b_frost: ['Доспех ледяного стража','Ice Guard Armor','Броня крижаного захисту','Eiswächterrüstung','Armure de garde de glace','Armadura de guardia de hielo','Armadura de Guarda de Gelo','Zbroja Strażnika Lodu','Buz Muhafızı Zırhı','冰卫铠甲'],
    skin_b_totem: ['Тотемный доспех','Totem Armor','Тотемна броня','Totempanzerung','Armure totémique','Armadura de tótem','Armadura de Totem','Totem Zbroja','Totem Zırhı','图腾铠甲'],
    skin_b_azure: ['Шкура лазурного зверя','Azure Beast Hide','Шкіра блакитного звіра','Die Haut des azurblauen Tieres','La peau de la bête azur','La piel de la bestia azul','A pele da besta azul','Skóra lazurowej bestii','Gök mavisi canavarın kabuğu','青兽的皮肤'],
    skin_b_nomad: ['Меховая накидка','Fur Cloak','Плащ хутряний','Pelzmantel','Cape en fourrure','Capa de piel','Capa de pele','Płaszcz futrzany','Kürk pelerin','毛皮斗篷'],
    skin_b_elkwar: ['Меховые доспехи','Fur Armor','Броня з хутра','Pelzrüstung','Armure de fourrure','Armadura de piel','Armadura de Pele','Zbroja z futra','Kürk Zırhı','毛皮盔甲'],
    skin_b_chief: ['Багровая броня','Crimson Armor','Багряна броня','Purpurrote Rüstung','Armure pourpre','Armadura carmesí','Armadura Carmesim','Szkarłatna Zbroja','Kızıl Zırh','赤红铠甲'],
    skin_b_owl:   ['Совиные крылья','Owl Wings','Совиные крылья','Eulenflügel','Ailes de hibou','Alas de búho','Asas de Coruja','Skrzydła sowy','Baykuş Kanatları','猫头鹰翅膀'],
    skin_b_furry: ['Мохнатая шуба','Shaggy Fur Coat','Мохнатая шуба','Zotteliger Pelzmantel','Manteau en fourrure hirsute','Abrigo peludo','Casaco de pele felpudo','Kudłaty płaszcz futrzany','Tüylü kürk manto','毛茸茸的皮草大衣'],
    skin_b_moth1: ['Крылья мотылька','Moth Wings','Крила молі','Mottenflügel','Ailes de papillon de nuit','Alitas de polilla','Asas de Mariposa','Skrzydła ćmy','Güve Kanatları','飞蛾翅膀'],
    skin_b_catninja: ['Сине-белое кимоно','Blue and White Kimono','Сине-белое кимоно','Blauer und weißer Kimono','Kimono bleu et blanc','Kimono azul y blanco','Quimono azul e branco','Niebiesko-białe kimono','Mavi ve beyaz kimono','蓝白色和服'],
    skin_b_reaper: ['Белый плащ','White Cloak','Білий плащ','Weißer Umhang','Cape blanche','Capa blanca','Capa branca','Biały płaszcz','Beyaz pelerin','白斗篷'],
    skin_b_moth2: ['Крылья императора','Emperor\'s Wings','Крила імператора','Flügel des Kaisers','Ailes de l\'Empereur','Alas de emperador','Asas do Imperador','Skrzydła Cesarza','İmparatorun Kanatları','皇帝的翅膀'],
    skin_b_bluewolf: ['Шкура синего волка','Blue Wolf Skin','Шкіра синього вовка','Blauer-Wolf-Skin','Peau de loup bleu','Piel de lobo azul','Pele de Lobo Azul','Skóra Niebieskiego Wilka','Mavi Kurt Postu','蓝狼皮'],
    skin_b_raven: ['Перья ворона','Raven\'s Feathers','Вороняні пір \'я','Rabenfedern','Plumes de corbeau','Plumas de cuervo','Penas de Corvo','Krucze pióra','Kuzgun Tüyleri','乌鸦羽毛'],
    skin_b_sailor: ['Тельняшка','Striped Shirt','Тельняшка','Telnyashka','Telnyashka','Telnyashka','Telnyashka','Telniaszka','Telnyashka','Telnyashka'],
    skin_b_pirate: ['Пиратский кафтан','Pirate Caftan','Піратський кафтан','Piratenkaftan','Pirate caftan','Caftán pirata','Caftan pirata','Kaftan piratów','Korsan kaftan','Pirate caftan'],
    skin_b_bonedrag: ['Плащ дракона','Dragon Cloak','Плащ дракона','Drachenumhang','Cape de dragon','Capa de dragón','Capa do Dragão','Płaszcz Smoka','Ejderha Örtüsü','龙斗篷'],
    skin_b_judo:  ['Белое кимоно','White Kimono','Біле кімоно','Weißer Kimono','Kimono blanc','Kimono blanco','Quimono branco','Białe kimono','Beyaz Kimono','白色和服'],
    skin_b_prince: ['Парадный мундир','Parade Uniform','Парадна форма','Paradeuniform','Uniforme de parade','Uniforme desfile','Uniforme de desfile','Mundur paradny','Geçit töreni üniform','游行制服'],
    skin_b_clown: ['Клоунский костюм','Clown Costume','Костюм клоуна','Clownskostüm','Costume de clown','Disfraz de payaso','Traje de palhaço','Kostium klauna','Palyaço kostümü','小丑时装'],
    skin_b_vampire: ['Бордовый плащ','Burgundy Cloak','Плащ бордовий','Burgunderroter Umhang','Cape bordeaux','Capa burdeos','Manto de Borgonha','Płaszcz w kolorze bordowym','Bordo pelerin','勃艮第斗篷'],
    skin_b_priest: ['Белая тога','White Toga','Біла тога','Weiße Toga','Toge blanche','Toga blanca','Toga branca','Biała toga','Beyaz toga','白色长袍'],
    skin_b_forest: ['Зелёная накидка','Green Cape','Зелений мис','Grüner Umhang','Cape verte','Capa verde','Capa verde','Zielona peleryna','Yeşil pelerin','绿色斗篷'],
    skin_b_glitch: ['Глитч-тело','Glitch Body','Тіло з глюком','Glitch-Körper','Corps Glitch','Cuerpo del fallo','Corpo Glitch','Korpus usterki','Glitch Gövdesi','Glitch Body'],
    skin_b_sunset: ['Градиент заката','Sunset Gradient','Градієнт заходу сонця','Sonnenuntergangsverlauf','Gradient au coucher du soleil','Degradado al atardecer','Gradiente do pôr do sol','Gradient zachodu słońca','Gün batımı gradyanı','日落坡度'],
    skin_b_popit: ['Поп-ит тело','Pop-It Body','Тіло Поп-іт','Pop-It-Körper','Corps Pop-It','Cuerpo Pop-It','Corpo Pop-It','Korpus pop-it','Pop - It Gövdesi','Pop-It Body'],
    skin_b_toxic: ['Токсичное тело','Toxic Body','Токсичне тіло','Giftiger Körper','Corps toxique','Cuerpo tóxico','Corpo tóxico','Ciało toksyczne','Zehirli cisim','有毒身体'],
    skin_b_nerd:  ['Тело с книгой','Body with a Book','Тіло з книгою','Body mit einem Buch','Corps avec un livre','Cuerpo con un libro','Corpo com um livro','Korpus z książką','Body with a book','带书的正文'],
    skin_b_shards: ['Витраж','Stained Glass','Вітраж','Bleiverglasung','Vitrail','Vitral','Vitral','Szkło witrażowe','Vitray','彩色玻璃'],
    skin_b_aqua:  ['Аквариум','Fish Tank','Акваріум','Aquarium','Aquarium','Pecera','Aquário','Akwarium','Akvaryum','水族馆'],
    skin_b_wire:  ['Каркас тела','Body Frame','Каркас кузова','Karosserierahmen','Cadre de carrosserie','Bastidor de carrocería','Estrutura da carroçaria','Rama korpusu','Gövde Çerçevesi','车身框架'],
    skin_b_dashed: ['Пунктирное тело','Dotted Body','Пунктирне тіло','Gepunkteter Körper','Corps en pointillés','Cuerpo punteado','Corpo pontilhado','Korpus kropkowany','Noktalı gövde','虚线正文'],
    skin_b_pastel: ['Пастельное платье','Pastel Dress','Сукня-пастель','Pastellfarbenes Kleid','Robe pastel','Vestido pastel','Vestido pastel','Sukienka pastelowa','Pastel elbise','粉色连衣裙'],
    skin_b_fox:   ['Лисьи лапы','Fox Paws','Лисячі Лапи','Fuchspfoten','Pattes de renard','Patas de zorro','Patas de Raposa','Lisie Łapy','Tilki Patileri','狐爪'],
    skin_b_slasher: ['Мачете','Machete','Мачете','Machete','Machete','Machetes','Machete','maczeta','Pala','弯刀'],
    skin_b_beach: ['Пляжное тело','Beach Body','Тіло на пляжі','Strandkörper','Corps de plage','Cuerpo de playa','Corpo de praia','Korpus plażowy','Plaj gövdesi','海滩主体'],
    skin_b_cat:   ['Кошачье тело','Cat Body','Тіло кота','Katzenkörper','Corps du chat','Cuerpo de gato','Corpo DO gato','Korpus kota','Kedi gövdesi','猫身'],
    skin_b_zombie: ['Разодранное тело','Ripped Body','Розірване тіло','Zerrissener Körper','Corps déchiré','Cuerpo rasgado','Corpo rasgado','Rozdarty korpus','Yırtık gövde','撕裂的身体'],
    skin_b_mummy: ['Бинты на теле','Body Bandages','Пов \'язки для тіла','Körperbandagen','Bandages corporels','Vendajes corporales','Ataduras corporais','Bandaże do ciała','Vücut Bandajları','身体绷带'],
    skin_b_crest_r: ['Багровый доспех','Crimson Armor','Багряна броня','Purpurrote Rüstung','Armure pourpre','Armadura carmesí','Armadura Carmesim','Szkarłatna Zbroja','Kızıl Zırh','赤红铠甲'],
    skin_b_crest_f: ['Тлеющий доспех','Smoldering Armor','Тліюча броня','Schwelende Rüstung','Armure fumante','Armadura ardiente','Armadura Ardente','Tląca się Zbroja','Yanan Zırh','闷烧铠甲'],
    skin_b_check: ['Зелёное тело','Green Body','Кузов зеленого кольору','Grüner Körper','Corps vert','Cuerpo verde','Corpo verde','Zielony korpus','Yeşil gövde','绿体'],

    /* ---------- редактор карт: интерфейс инструмента ---------- */
    edProps: ["Свойства","Properties","Властивості","Eigenschaften","Propriétés","Propiedades","Propriedades","Właściwości","Özellikler","属性"],
    edExit: ["Выйти","Exit","Вийти","Verlassen","Quitter","Salir","Sair","Wyjdź","Çıkış","退出"],
    edExitTip: ["выйти из игры (Esc)","exit game (Esc)","вийти з гри (Esc)","Spiel verlassen (Esc)","quitter la partie (Éch.)","salir del juego (Esc)","sair do jogo (Esc)","wyjdź z gry (Esc)","oyundan çık (Esc)","退出游戏 (Esc)"],
    hudCoinLabel: ["Монеты","Coins","Монети","Münzen","Pièces","Monedas","Moedas","Monety","Jetonlar","金币"],
    hudDeathLabel: ["Смерти","Deaths","Смерті","Tode","Morts","Muertes","Mortes","Zgony","Ölümler","死亡"],
    gameCoinTip: ["монет в карте (максимум 3)","coins on the map (max 3)","монет на карті (максимум 3)","Münzen auf der Karte (max. 3)","pièces sur la carte (max 3)","monedas en el mapa (máx. 3)","moedas no mapa (máx. 3)","monet na mapie (maks. 3)","haritadaki jeton (maks. 3)","地图金币数（最多3）"],
    edTimeTip: ["время забега","run time","час забігу","Laufzeit","temps de course","tiempo de carrera","tempo de corrida","czas przejścia","koşu süresi","通关时间"],
    edCoinTip: ["собрано монет","coins collected","зібрано монет","gesammelte Münzen","pièces collectées","monedas recogidas","moedas coletadas","zebrane monety","toplanan jeton","已收集金币"],
    edObjTip: ["объектов в карте (максимум 2000)","objects on the map (max 2000)","об'єктів на карті (максимум 2000)","Objekte auf der Karte (max. 2000)","objets sur la carte (max 2000)","objetos en el mapa (máx. 2000)","objetos no mapa (máx. 2000)","obiektów na mapie (maks. 2000)","haritadaki nesneler (maks. 2000)","地图物体数（最多2000）"],
    edDeathTip: ["смертей","deaths","смертей","Tode","morts","muertes","mortes","zgony","ölüm","死亡次数"],
    ok: ["OK","OK","Гаразд","OK","OK","OK","OK","OK","Tamam","确定"],
    toolSelect: ["Выделение","Select","Виділення","Auswahl","Sélection","Selección","Seleção","Zaznaczanie","Seçim","选择"],
    toolHand: ["Рука (двигать карту)","Hand (move map)","Рука (рухати карту)","Hand (Karte verschieben)","Main (déplacer la carte)","Mano (mover mapa)","Mão (mover mapa)","Ręka (przesuwanie mapy)","El (haritayı taşı)","手形（移动地图）"],
    toolBlock: ["Блок","Block","Блок","Block","Bloc","Bloque","Bloco","Blok","Blok","方块"],
    toolCircle: ["Круг","Circle","Коло","Kreis","Cercle","Círculo","Círculo","Koło","Daire","圆形"],
    toolTriangle: ["Треугольник","Triangle","Трикутник","Dreieck","Triangle","Triángulo","Triângulo","Trójkąt","Üçgen","三角形"],
    toolText: ["Текст","Text","Текст","Text","Texte","Texto","Texto","Tekst","Metin","文本"],
    toolCoin: ["Монета","Coin","Монета","Münze","Pièce","Moneda","Moeda","Moneta","Jeton","金币"],
    toolSpawn: ["Точка старта","Start point","Точка старту","Startpunkt","Point de départ","Punto de inicio","Ponto de partida","Punkt startowy","Başlangıç noktası","起点"],
    toolButton: ["Кнопка","Button","Кнопка","Taste","Bouton","Botón","Botão","Przycisk","Buton","按钮"],
    toolLever: ["Рычаг","Lever","Важіль","Hebel","Levier","Palanca","Alavanca","Dźwignia","Kol","杠杆"],
    toolCheckpoint: ["Чекпоинт","Checkpoint","Чекпоінт","Checkpoint","Point de contrôle","Punto de control","Ponto de controle","Punkt kontrolny","Kontrol noktası","检查点"],
    toolFinish: ["Финиш","Finish","Фініш","Ziel","Arrivée","Meta","Chegada","Meta","Bitiş","终点"],
    btnSaveTip: ["Сохранить .txt","Save .txt","Зберегти .txt",".txt speichern","Enregistrer .txt","Guardar .txt","Salvar .txt","Zapisz .txt",".txt kaydet","保存 .txt"],
    btnOpenTip: ["Открыть","Open","Відкрити","Öffnen","Ouvrir","Abrir","Abrir","Otwórz","Aç","打开"],
    btnJsonTip: ["Экспорт JSON","Export JSON","Експорт JSON","JSON exportieren","Exporter en JSON","Exportar JSON","Exportar JSON","Eksport JSON","JSON dışa aktar","导出 JSON"],
    btnUndoTip: ["Отменить (Ctrl+Z)","Undo (Ctrl+Z)","Скасувати (Ctrl+Z)","Rückgängig (Strg+Z)","Annuler (Ctrl+Z)","Deshacer (Ctrl+Z)","Desfazer (Ctrl+Z)","Cofnij (Ctrl+Z)","Geri al (Ctrl+Z)","撤销 (Ctrl+Z)"],
    btnRedoTip: ["Вернуть (Ctrl+Y)","Redo (Ctrl+Y)","Повернути (Ctrl+Y)","Wiederholen (Strg+Y)","Rétablir (Ctrl+Y)","Rehacer (Ctrl+Y)","Refazer (Ctrl+Y)","Ponów (Ctrl+Y)","Yinele (Ctrl+Y)","重做 (Ctrl+Y)"],
    btnCopyTip: ["Дубликат (Ctrl+D)","Duplicate (Ctrl+D)","Дублювати (Ctrl+D)","Duplizieren (Strg+D)","Dupliquer (Ctrl+D)","Duplicar (Ctrl+D)","Duplicar (Ctrl+D)","Duplikuj (Ctrl+D)","Kopyala (Ctrl+D)","复制 (Ctrl+D)"],
    btnDelTip: ["Удалить (Del)","Delete (Del)","Видалити (Del)","Löschen (Entf)","Supprimer (Suppr)","Eliminar (Supr)","Excluir (Del)","Usuń (Del)","Sil (Del)","删除 (Del)"],
    btnGridTip: ["Сетка (G)","Grid (G)","Сітка (G)","Raster (G)","Grille (G)","Cuadrícula (G)","Grade (G)","Siatka (G)","Izgara (G)","网格 (G)"],
    btnPlayTip: ["Играть","Play","Грати","Spielen","Jouer","Jugar","Jogar","Graj","Oyna","游玩"],
    coinLimitTitle: ["Максимум {n} монеты","Max {n} coins","Максимум {n} монети","Maximal {n} Münzen","Maximum {n} pièces","Máximo {n} monedas","Máximo de {n} moedas","Maksymalnie {n} monet","En fazla {n} jeton","最多 {n} 枚金币"],
    coinLimitBody: ["Больше монет в карту положить нельзя.","You can't add more coins to the map.","Більше монет на карту покласти не можна.","Es können keine weiteren Münzen platziert werden.","Impossible d'ajouter plus de pièces à la carte.","No se pueden añadir más monedas al mapa.","Não é possível adicionar mais moedas ao mapa.","Nie można dodać więcej monet do mapy.","Haritaya daha fazla jeton eklenemez.","无法在地图上放置更多金币。"],
    objLimitTitle: ["Предел {n} объектов","Limit: {n} objects","Ліміт {n} об'єктів","Limit: {n} Objekte","Limite : {n} objets","Límite de {n} objetos","Limite de {n} objetos","Limit {n} obiektów","Sınır: {n} nesne","上限 {n} 个物体"],
    objLimitBody: ["В карте уже {n}. Удалите лишнее, чтобы добавить новое.","The map already has {n}. Remove something to add a new one.","На карті вже {n}. Видаліть зайве, щоб додати нове.","Die Karte hat bereits {n}. Entfernen Sie etwas, um Neues hinzuzufügen.","La carte en compte déjà {n}. Supprimez-en pour en ajouter un nouveau.","El mapa ya tiene {n}. Elimina algo para añadir uno nuevo.","O mapa já tem {n}. Remova algo para adicionar um novo.","Mapa ma już {n}. Usuń coś, aby dodać nowy.","Haritada zaten {n} var. Yenisini eklemek için bir şey kaldırın.","地图上已有 {n} 个。删除一些才能添加新的。"],
    noSpawnTitle: ["Нет точки старта","No start point","Немає точки старту","Kein Startpunkt","Aucun point de départ","Sin punto de inicio","Sem ponto de partida","Brak punktu startowego","Başlangıç noktası yok","没有起点"],
    noSpawnBody: ["Поставь инструмент «Точка старта», потом жми ▶.","Place the \"Start point\" tool, then press ▶.","Постав інструмент «Точка старту», потім натисни ▶.","Platziere das Werkzeug \"Startpunkt\" und drücke dann ▶.","Place l'outil « Point de départ », puis appuie sur ▶.","Coloca la herramienta \"Punto de inicio\" y luego pulsa ▶.","Coloque a ferramenta \"Ponto de partida\" e depois pressione ▶.","Umieść narzędzie „Punkt startowy”, a potem naciśnij ▶.","\"Başlangıç noktası\" aracını yerleştir, sonra ▶'ya bas.","放置“起点”工具，然后按 ▶。"],
    spawnCloseTitle: ["Старт слишком близко к финишу","Start is too close to the finish","Старт занадто близько до фінішу","Start ist zu nah am Ziel","Le départ est trop proche de l'arrivée","El inicio está demasiado cerca de la meta","O início está muito perto da chegada","Start jest zbyt blisko mety","Başlangıç bitişe çok yakın","起点离终点太近"],
    spawnCloseBody: ["Между ними {n} точек, нужно хотя бы {m}. Отодвинь старт или финиш.","There are {n} points between them, need at least {m}. Move the start or finish.","Між ними {n} точок, потрібно щонайменше {m}. Відсунь старт або фініш.","Zwischen ihnen liegen {n} Punkte, mindestens {m} nötig. Verschiebe Start oder Ziel.","Il y a {n} points entre eux, il en faut au moins {m}. Déplace le départ ou l'arrivée.","Hay {n} puntos entre ellos, se necesitan al menos {m}. Mueve el inicio o la meta.","Há {n} pontos entre eles, é preciso pelo menos {m}. Mova o início ou a chegada.","Jest między nimi {n} punktów, potrzeba co najmniej {m}. Przesuń start lub metę.","Aralarında {n} nokta var, en az {m} gerekli. Başlangıcı veya bitişi taşı.","两点间距 {n}，至少需要 {m}。请移动起点或终点。"],
    spawnClosePublishBody: ["Между ними {n} точек. Отодвинь старт или финиш и попробуй снова.","There are {n} points between them. Move the start or finish and try again.","Між ними {n} точок. Відсунь старт або фініш і спробуй знову.","Zwischen ihnen liegen {n} Punkte. Verschiebe Start oder Ziel und versuche es erneut.","Il y a {n} points entre eux. Déplace le départ ou l'arrivée et réessaie.","Hay {n} puntos entre ellos. Mueve el inicio o la meta e inténtalo de nuevo.","Há {n} pontos entre eles. Mova o início ou a chegada e tente novamente.","Jest między nimi {n} punktów. Przesuń start lub metę i spróbuj ponownie.","Aralarında {n} nokta var. Başlangıcı veya bitişi taşıyıp tekrar dene.","两点间距 {n}。请移动起点或终点后重试。"],
    finishTitle: ["ФИНИШ!","FINISH!","ФІНІШ!","ZIEL!","ARRIVÉE !","¡META!","CHEGADA!","META!","BİTİŞ!","终点！"],
    finishBody: ["Время {t}с · монет {c}/{ct} · смертей {d}   —   новый забег через мгновение","Time {t}s · coins {c}/{ct} · deaths {d}   —   new run starting shortly","Час {t}с · монет {c}/{ct} · смертей {d}   —   новий забіг за мить","Zeit {t}s · Münzen {c}/{ct} · Tode {d}   —   neuer Lauf startet gleich","Temps {t}s · pièces {c}/{ct} · morts {d}   —   nouvelle course dans un instant","Tiempo {t}s · monedas {c}/{ct} · muertes {d}   —   nueva carrera en un momento","Tempo {t}s · moedas {c}/{ct} · mortes {d}   —   nova corrida em breve","Czas {t}s · monety {c}/{ct} · zgony {d}   —   nowe podejście za chwilę","Süre {t}sn · jeton {c}/{ct} · ölüm {d}   —   yeni koşu birazdan başlıyor","用时 {t}秒 · 金币 {c}/{ct} · 死亡 {d}   —   新一轮即将开始"],
    droppedObjsTitle: ["Убрано объектов: {n}","Removed objects: {n}","Видалено об'єктів: {n}","Entfernte Objekte: {n}","Objets supprimés : {n}","Objetos eliminados: {n}","Objetos removidos: {n}","Usunięte obiekty: {n}","Kaldırılan nesneler: {n}","已移除物体：{n}"],
    droppedObjsBody: ["В режиме «{mode}» они не работают. Ctrl+Z вернёт их обратно.","They don't work in \"{mode}\" mode. Ctrl+Z will bring them back.","У режимі «{mode}» вони не працюють. Ctrl+Z поверне їх назад.","Sie funktionieren im Modus \"{mode}\" nicht. Strg+Z bringt sie zurück.","Ils ne fonctionnent pas en mode « {mode} ». Ctrl+Z les ramènera.","No funcionan en el modo \"{mode}\". Ctrl+Z los recuperará.","Não funcionam no modo \"{mode}\". Ctrl+Z os trará de volta.","Nie działają w trybie „{mode}”. Ctrl+Z je przywróci.","\"{mode}\" modunda çalışmazlar. Ctrl+Z onları geri getirir.","它们在“{mode}”模式下不起作用。Ctrl+Z 可以恢复它们。"],
    copiedTitle: ["Скопировано","Copied","Скопійовано","Kopiert","Copié","Copiado","Copiado","Skopiowano","Kopyalandı","已复制"],
    copiedBody: ["Ctrl+V поставит копию под курсором","Ctrl+V will place a copy under the cursor","Ctrl+V розмістить копію під курсором","Strg+V platziert eine Kopie unter dem Cursor","Ctrl+V placera une copie sous le curseur","Ctrl+V colocará una copia bajo el cursor","Ctrl+V colocará uma cópia sob o cursor","Ctrl+V umieści kopię pod kursorem","Ctrl+V imlecin altına bir kopya yerleştirir","Ctrl+V 会在光标处放置一份副本"],
    linkHelpClosed: ["Как связать? ▾","How to link? ▾","Як пов'язати? ▾","Wie verknüpfen? ▾","Comment lier ? ▾","¿Cómo vincular? ▾","Como vincular? ▾","Jak połączyć? ▾","Nasıl bağlanır? ▾","如何关联？▾"],
    linkHelpOpen: ["Как связать? ▴","How to link? ▴","Як пов'язати? ▴","Wie verknüpfen? ▴","Comment lier ? ▴","¿Cómo vincular? ▴","Como vincular? ▴","Jak połączyć? ▴","Nasıl bağlanır? ▴","如何关联？▴"],
    linkHelpBody: ["1. У <b>блока-цели</b> задай <b>ID</b> — например <code>g1</code>.<br>2. У <b>Кнопки</b> или <b>Рычага</b> впиши тот же <code>g1</code> в поле <b>Цели</b>.<br>3. Нажми ▶ — блок откроется от кнопки.<br><br>Целей можно указать несколько через запятую: <code>g1,g2</code>.<br>Кнопка держит, пока на ней стоят. Рычаг переключает насовсем.","1. Give the <b>target shape</b> an <b>ID</b> — e.g. <code>g1</code>.<br>2. On the <b>Button</b> or <b>Lever</b>, put the same <code>g1</code> in the <b>Targets</b> field.<br>3. Press ▶ — the block opens from the button.<br><br>You can list several targets separated by commas: <code>g1,g2</code>.<br>The button holds while stood on. The lever toggles permanently.","1. У <b>цільової фігури</b> вкажи <b>ID</b> — наприклад <code>g1</code>.<br>2. У <b>Кнопки</b> або <b>Важеля</b> впиши той самий <code>g1</code> у поле <b>Цілі</b>.<br>3. Натисни ▶ — блок відкриється від кнопки.<br><br>Цілей можна вказати кілька через кому: <code>g1,g2</code>.<br>Кнопка тримає, поки на ній стоять. Важіль перемикає назавжди.","1. Gib der <b>Zielform</b> eine <b>ID</b> — z. B. <code>g1</code>.<br>2. Trage bei <b>Taste</b> oder <b>Hebel</b> dieselbe <code>g1</code> im Feld <b>Ziele</b> ein.<br>3. Drücke ▶ — der Block öffnet sich per Taste.<br><br>Mehrere Ziele können durch Kommas getrennt angegeben werden: <code>g1,g2</code>.<br>Die Taste hält, solange man darauf steht. Der Hebel schaltet dauerhaft um.","1. Donne un <b>ID</b> à la <b>forme cible</b> — par ex. <code>g1</code>.<br>2. Sur le <b>Bouton</b> ou le <b>Levier</b>, inscris le même <code>g1</code> dans le champ <b>Cibles</b>.<br>3. Appuie sur ▶ — le bloc s'ouvre grâce au bouton.<br><br>Tu peux indiquer plusieurs cibles séparées par des virgules : <code>g1,g2</code>.<br>Le bouton maintient tant qu'on est dessus. Le levier bascule définitivement.","1. Ponle un <b>ID</b> a la <b>forma objetivo</b> — p. ej. <code>g1</code>.<br>2. En el <b>Botón</b> o la <b>Palanca</b>, escribe el mismo <code>g1</code> en el campo <b>Objetivos</b>.<br>3. Pulsa ▶ — el bloque se abre con el botón.<br><br>Puedes indicar varios objetivos separados por comas: <code>g1,g2</code>.<br>El botón mantiene mientras se está encima. La palanca cambia para siempre.","1. Dê um <b>ID</b> à <b>forma alvo</b> — ex. <code>g1</code>.<br>2. No <b>Botão</b> ou na <b>Alavanca</b>, coloque o mesmo <code>g1</code> no campo <b>Alvos</b>.<br>3. Pressione ▶ — o bloco abre pelo botão.<br><br>É possível indicar vários alvos separados por vírgulas: <code>g1,g2</code>.<br>O botão mantém enquanto estiver pressionado. A alavanca alterna permanentemente.","1. Nadaj <b>ID</b> figurze docelowej — np. <code>g1</code>.<br>2. Przy <b>Przycisku</b> lub <b>Dźwigni</b> wpisz to samo <code>g1</code> w polu <b>Cele</b>.<br>3. Naciśnij ▶ — blok otworzy się przyciskiem.<br><br>Można podać kilka celów oddzielonych przecinkami: <code>g1,g2</code>.<br>Przycisk trzyma, dopóki się na nim stoi. Dźwignia przełącza na stałe.","1. <b>Hedef şekle</b> bir <b>ID</b> ver — örn. <code>g1</code>.<br>2. <b>Buton</b> veya <b>Kol</b>'da <b>Hedefler</b> alanına aynı <code>g1</code>'i yaz.<br>3. ▶'ya bas — blok butonla açılır.<br><br>Birden fazla hedefi virgülle ayırarak yazabilirsin: <code>g1,g2</code>.<br>Buton üzerinde durulduğu sürece tutar. Kol kalıcı olarak değiştirir.","1. 给<b>目标图形</b>设置一个 <b>ID</b>——例如 <code>g1</code>。<br>2. 在<b>按钮</b>或<b>杠杆</b>的<b>目标</b>字段中填写相同的 <code>g1</code>。<br>3. 按 ▶ —— 方块将由按钮打开。<br><br>可以用逗号分隔填写多个目标：<code>g1,g2</code>。<br>按钮在被踩住时保持开启，杠杆则永久切换状态。"],
    lblWidth: ["Ширина","Width","Ширина","Breite","Largeur","Ancho","Largura","Szerokość","Genişlik","宽度"],
    lblHeight: ["Высота","Height","Висота","Höhe","Hauteur","Alto","Altura","Wysokość","Yükseklik","高度"],
    lblRotation: ["Поворот","Rotation","Поворот","Drehung","Rotation","Rotación","Rotação","Obrót","Döndürme","旋转"],
    lblSize: ["Размер","Size","Розмір","Größe","Taille","Tamaño","Tamanho","Rozmiar","Boyut","尺寸"],
    lblColor: ["Цвет","Color","Колір","Farbe","Couleur","Color","Cor","Kolor","Renk","颜色"],
    grpGameProps: ["Игровые свойства","Game properties","Ігрові властивості","Spieleigenschaften","Propriétés de jeu","Propiedades de juego","Propriedades do jogo","Właściwości gry","Oyun özellikleri","游戏属性"],
    chkDeadly: ["Яд (убивает)","Poison (kills)","Отрута (вбиває)","Gift (tödlich)","Poison (tue)","Veneno (mata)","Veneno (mata)","Trucizna (zabija)","Zehir (öldürür)","毒素（致命）"],
    chkGhost: ["Проходимый (декорация)","Passable (decoration)","Прохідний (декорація)","Durchlässig (Dekoration)","Traversable (décor)","Atravesable (decoración)","Atravessável (decoração)","Przenikalny (dekoracja)","Geçilebilir (dekor)","可穿过（装饰）"],
    chkHideSpot: ["Укрытие для пряток","Hiding spot","Схованка для хованок","Versteck","Cachette","Escondite","Esconderijo","Kryjówka","Saklanma yeri","捉迷藏藏身处"],
    chkRicochet: ["Рикошет","Ricochet","Рикошет","Abpraller","Ricochet","Rebote","Ricochete","Rykoszet","Sekme","弹射"],
    lblBouncePower: ["Сила отскока","Bounce power","Сила відскоку","Sprungkraft","Force de rebond","Fuerza de rebote","Força do ricochete","Siła odbicia","Sekme gücü","弹力大小"],
    chkPushable: ["Толкается","Pushable","Рухоме поштовхом","Schiebbar","Poussable","Empujable","Empurrável","Popychalny","İtilebilir","可推动"],
    lblMass: ["Масса","Mass","Маса","Masse","Masse","Masa","Massa","Masa","Kütle","质量"],
    chkMoves: ["Двигается","Moves","Рухається","Bewegt sich","Se déplace","Se mueve","Move-se","Porusza się","Hareket eder","移动"],
    lblMoveX: ["Ход по X","Move X","Хід по X","Bewegung X","Déplacement X","Movimiento X","Movimento X","Ruch X","X hareketi","X 位移"],
    lblMoveY: ["Ход по Y","Move Y","Хід по Y","Bewegung Y","Déplacement Y","Movimiento Y","Movimento Y","Ruch Y","Y hareketi","Y 位移"],
    lblSpeed: ["Скорость","Speed","Швидкість","Geschwindigkeit","Vitesse","Velocidad","Velocidade","Prędkość","Hız","速度"],
    chkSpins: ["Вращается","Rotates","Обертається","Rotiert","Tourne","Gira","Gira","Obraca się","Döner","旋转"],
    lblSpinSpeed: ["Скорость вращения","Rotation speed","Швидкість обертання","Rotationsgeschwindigkeit","Vitesse de rotation","Velocidad de rotación","Velocidade de rotação","Prędkość obrotu","Dönüş hızı","旋转速度"],
    grpLinks: ["Связи","Links","Зв'язки","Verknüpfungen","Liaisons","Enlaces","Ligações","Powiązania","Bağlantılar","关联"],
    lblTargets: ["Цели","Targets","Цілі","Ziele","Cibles","Objetivos","Alvos","Cele","Hedefler","目标"],
    chkStartsOpen: ["Открыт сначала (проходим)","Starts open (passable)","Спочатку відкритий (прохідний)","Startet offen (durchlässig)","Ouvert au départ (traversable)","Abierto al inicio (atravesable)","Aberto no início (atravessável)","Otwarty na starcie (przenikalny)","Başlangıçta açık (geçilebilir)","初始为开启（可穿过）"],
    grpOrder: ["Порядок","Order","Порядок","Reihenfolge","Ordre","Orden","Ordem","Kolejność","Sıra","层级"],
    zBack: ["На зад","Send back","На задній план","Nach hinten","Envoyer en arrière","Enviar atrás","Enviar para trás","Do tyłu","Arkaya gönder","置于底层"],
    zFront: ["Вперёд","Bring front","На передній план","Nach vorne","Amener en avant","Traer al frente","Trazer para frente","Do przodu","Öne getir","置于顶层"],
    accessDeniedTitle: ["Доступ запрещён","Access denied","Доступ заборонено","Zugriff verweigert","Accès refusé","Acceso denegado","Acesso negado","Odmowa dostępu","Erişim engellendi","访问被拒绝"],
    accessDeniedFileBody: ["Файл не подписан этим редактором.","The file isn't signed by this editor.","Файл не підписаний цим редактором.","Die Datei ist nicht von diesem Editor signiert.","Le fichier n'est pas signé par cet éditeur.","El archivo no está firmado por este editor.","O arquivo não foi assinado por este editor.","Plik nie jest podpisany przez ten edytor.","Dosya bu düzenleyici tarafından imzalanmamış.","该文件不是由此编辑器签名的。"],
    accessDeniedKeyBody: ["Ключ карты не совпадает. Только разработчик.","The map key doesn't match. Developer only.","Ключ карти не збігається. Лише розробник.","Der Kartenschlüssel stimmt nicht überein. Nur Entwickler.","La clé de la carte ne correspond pas. Réservé au développeur.","La clave del mapa no coincide. Solo para el desarrollador.","A chave do mapa não corresponde. Apenas o desenvolvedor.","Klucz mapy się nie zgadza. Tylko deweloper.","Harita anahtarı eşleşmiyor. Yalnızca geliştirici.","地图密钥不匹配。仅限开发者。"],
    readErrorBody: ["Не удалось прочитать файл карты.","Couldn't read the map file.","Не вдалося прочитати файл карти.","Die Kartendatei konnte nicht gelesen werden.","Impossible de lire le fichier de la carte.","No se pudo leer el archivo del mapa.","Não foi possível ler o arquivo do mapa.","Nie udało się odczytać pliku mapy.","Harita dosyası okunamadı.","无法读取地图文件。"],
    mapNotFoundTitle: ["Карта не найдена","Map not found","Карту не знайдено","Karte nicht gefunden","Carte introuvable","Mapa no encontrado","Mapa não encontrado","Nie znaleziono mapy","Harita bulunamadı","未找到地图"],
    mapNotFoundBody: ["Не удалось загрузить «{name}».","Couldn't load \"{name}\".","Не вдалося завантажити «{name}».","\"{name}\" konnte nicht geladen werden.","Impossible de charger « {name} ».","No se pudo cargar \"{name}\".","Não foi possível carregar \"{name}\".","Nie udało się wczytać „{name}”.","\"{name}\" yüklenemedi.","无法加载“{name}”。"],
    editLoadServerDownBody: ["Не удалось загрузить карту для редактирования.","Couldn't load the map for editing.","Не вдалося завантажити карту для редагування.","Die Karte konnte nicht zum Bearbeiten geladen werden.","Impossible de charger la carte pour l'édition.","No se pudo cargar el mapa para editarlo.","Não foi possível carregar o mapa para edição.","Nie udało się wczytać mapy do edycji.","Harita düzenleme için yüklenemedi.","无法加载地图进行编辑。"],
    publishBtnTip: ["Опубликовать в Maps Browser","Publish to Maps Browser","Опублікувати в Maps Browser","In Maps Browser veröffentlichen","Publier dans Maps Browser","Publicar en Maps Browser","Publicar no Maps Browser","Opublikuj w Maps Browser","Maps Browser'da yayınla","发布到地图库"],
    publishBtnLabel: ["Опубликовать","Publish","Опублікувати","Veröffentlichen","Publier","Publicar","Publicar","Opublikuj","Yayınla","发布"],
    tooManyObjectsTitle: ["Слишком много объектов","Too many objects","Забагато об'єктів","Zu viele Objekte","Trop d'objets","Demasiados objetos","Muitos objetos","Za dużo obiektów","Çok fazla nesne","物体过多"],
    tooManyObjectsBody: ["В карте {n}. Разрешено не больше {lim}.","The map has {n}. Allowed no more than {lim}.","На карті {n}. Дозволено не більше {lim}.","Die Karte hat {n}. Erlaubt sind höchstens {lim}.","La carte en compte {n}. Autorisé : {lim} max.","El mapa tiene {n}. Permitido no más de {lim}.","O mapa tem {n}. Permitido no máximo {lim}.","Mapa ma {n}. Dozwolone maks. {lim}.","Haritada {n} var. En fazla {lim} izin veriliyor.","地图上有 {n} 个。最多允许 {lim} 个。"],
    tooManyCoinsTitle: ["Слишком много монет","Too many coins","Забагато монет","Zu viele Münzen","Trop de pièces","Demasiadas monedas","Muitas moedas","Za dużo monet","Çok fazla jeton","金币过多"],
    tooManyCoinsBody: ["В карте {n}. Разрешено не больше {lim} — уберите лишние.","The map has {n}. Allowed no more than {lim} — remove extras.","На карті {n}. Дозволено не більше {lim} — приберіть зайве.","Die Karte hat {n}. Erlaubt sind höchstens {lim} — entfernen Sie die überzähligen.","La carte en compte {n}. Autorisé : {lim} max — retirez les extras.","El mapa tiene {n}. Permitido no más de {lim}; elimina las de sobra.","O mapa tem {n}. Permitido no máximo {lim} — remova as extras.","Mapa ma {n}. Dozwolone maks. {lim} — usuń nadmiarowe.","Haritada {n} var. En fazla {lim} izin veriliyor — fazlalıkları kaldır.","地图上有 {n} 个。最多允许 {lim} 个——请移除多余的。"],
    wrongModeObjTitle: ["Объекты не для этого режима","Objects not for this mode","Об'єкти не для цього режиму","Objekte nicht für diesen Modus","Objets non compatibles avec ce mode","Objetos no válidos para este modo","Objetos não compatíveis com este modo","Obiekty nie dla tego trybu","Bu mod için olmayan nesneler","该模式不支持的物体"],
    wrongModeObjBody: ["В режиме «{mode}» не работают: {list}","Don't work in \"{mode}\" mode: {list}","У режимі «{mode}» не працюють: {list}","Funktionieren im Modus \"{mode}\" nicht: {list}","Ne fonctionnent pas en mode « {mode} » : {list}","No funcionan en el modo \"{mode}\": {list}","Não funcionam no modo \"{mode}\": {list}","Nie działają w trybie „{mode}”: {list}","\"{mode}\" modunda çalışmıyor: {list}","在“{mode}”模式下不起作用：{list}"],
    publishCollectFailTitle: ["Не удалось собрать карту","Couldn't build the map","Не вдалося зібрати карту","Die Karte konnte nicht erstellt werden","Impossible de générer la carte","No se pudo compilar el mapa","Não foi possível montar o mapa","Nie udało się zbudować mapy","Harita oluşturulamadı","无法生成地图"],
    publishSuccessTitle: ["Карта опубликована","Map published","Карту опубліковано","Karte veröffentlicht","Carte publiée","Mapa publicado","Mapa publicado","Mapa opublikowana","Harita yayınlandı","地图已发布"],
    publishExistsTitle: ["Карта уже есть","Map already exists","Карта вже існує","Karte existiert bereits","La carte existe déjà","El mapa ya existe","O mapa já existe","Mapa już istnieje","Harita zaten mevcut","地图已存在"],
    publishFailedTitle: ["Не получилось","Failed","Не вдалося","Fehlgeschlagen","Échec","Fallo","Falhou","Nie udało się","Başarısız","失败"],
    publishServerDownBody: ["Не удалось связаться с сервером.","Couldn't reach the server.","Не вдалося зв'язатися з сервером.","Der Server konnte nicht erreicht werden.","Impossible de contacter le serveur.","No se pudo contactar con el servidor.","Não foi possível contatar o servidor.","Nie udało się połączyć z serwerem.","Sunucuya ulaşılamadı.","无法连接服务器。"],
    publishAskTitle: ["Публикация карты","Publish map","Публікація карти","Karte veröffentlichen","Publier la carte","Publicar mapa","Publicar mapa","Publikacja mapy","Harita yayınlama","发布地图"],
    publishNamePrompt: ["Название карты (2–30 символов):","Map name (2–30 characters):","Назва карти (2–30 символів):","Kartenname (2–30 Zeichen):","Nom de la carte (2 à 30 caractères) :","Nombre del mapa (2–30 caracteres):","Nome do mapa (2–30 caracteres):","Nazwa mapy (2–30 znaków):","Harita adı (2-30 karakter):","地图名称（2–30个字符）："],
    nameTooShortTitle: ["Слишком короткое название","Name too short","Занадто коротка назва","Name zu kurz","Nom trop court","Nombre demasiado corto","Nome muito curto","Za krótka nazwa","İsim çok kısa","名称过短"],
    nameTooShortBody: ["Нужно хотя бы 2 символа.","Need at least 2 characters.","Потрібно щонайменше 2 символи.","Mindestens 2 Zeichen erforderlich.","Il faut au moins 2 caractères.","Se necesitan al menos 2 caracteres.","É necessário pelo menos 2 caracteres.","Potrzeba co najmniej 2 znaków.","En az 2 karakter gerekli.","至少需要2个字符。"],
    edHomeTitle: ["На главную","Home","На головну","Startseite","Accueil","Inicio","Início","Strona główna","Ana sayfa","返回首页"],
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
