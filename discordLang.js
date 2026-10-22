// ============ ЯЗЫКИ ОТВЕТОВ БОТА (кроме английского и русского) ============
// Язык человека бот берёт у самого Discord: в каждом нажатии и каждой команде
// есть его язык (locale). Сюда вынесены готовые переводы всего, что видят
// игроки: наказания и правила, /servers, /account. Что здесь не переведено
// (команды владельца: справка, статистика, список предупреждений), показывается
// по-английски. Переводы вшиты в код — никуда ничего не отправляется.
// Подстановки в фигурных скобках ({n}, {d}...) переводить нельзя: их ставит бот.
// Добавить язык: новая запись ниже с теми же ключами (test-discord-views.js
// проверяет, что ничего не забыто и подстановки на месте) + код языка Discord
// в LOCALES (discordViews.js), если он отличается от двух букв.
'use strict';

// ключи строк, которые обязаны быть в каждом языке (остальные — только английские/русские)
const KEYS = ['warn', 'mute', 'ban', 'unmute', 'unban', 'unwarn', 'removed', 'rule', 'reason', 'other', 'customWords', 'nativeWord', 'noReason',
  'by', 'byBot', 'caseN', 'ofLimit', 'forever', 'permanent', 'nextMute', 'escalated', 'escalatedBlocked', 'tally', 'untilLabel', 'lifts', 'banWord',
  'status', 'notApplied', 'ownerBlocked', 'adminBlocked', 'failed', 'canTalk', 'backIn', 'clean', 'mistake', 'warnsAddShort', 'updated',
  'actNone', 'actWarn', 'actMute', 'actBan',
  'serversTitle', 'onlineN', 'noRoomsNow', 'stOpen', 'stFull', 'stFreeing', 'phHiding', 'phHunt', 'phStory', 'leftT', 'mapN', 'moreRooms',
  'refresh', 'playNow', 'gRaceMode', 'gHnsMode', 'playersN', 'playerN', 'roomsN', 'roomN', 'upTo40',
  'openProfile', 'tabProfile', 'tabMaps', 'tabFriends', 'perToday', 'perWeek', 'perAll', 'joined', 'coinsL', 'raceScores', 'hsScores', 'noRank',
  'aboutL', 'nothingWritten', 'todayWord', 'weekWord', 'noMapsYet', 'noFriendsYet', 'published', 'inGameTag', 'likesN', 'onlineNowTag',
  'minAgo', 'hAgo', 'dAgo', 'longAgo', 'friendsL', 'mapsL', 'moreN2', 'race', 'hns', 'myLang', 'rulesTitle'];
// что нашёл автомод (kind находки)
const NOTE_KEYS = ['flood', 'invite', 'nsfw-link', 'nsfw-image', 'slur', 'selfharm', 'scam-text', 'everyone-link', 'badfile', 'scam', 'grabber', 'cheat',
  'custom', 'native-word', 'warns'];

const PACKS = {
  /* ---------- español ---------- */
  es: {
    name: 'Español', locale: 'es',
    s: {
      warn: 'Advertencia', mute: 'Silenciado', ban: 'Baneado', unmute: 'Silencio levantado', unban: 'Ban levantado', unwarn: 'Advertencias eliminadas',
      removed: 'Mensaje eliminado', rule: 'Regla', reason: 'Motivo', other: 'Otro', customWords: 'Palabras prohibidas en este servidor',
      nativeWord: 'Regla de AutoMod del servidor', noReason: 'Sin motivo indicado', by: 'Emitido por {who}', byBot: 'Automático, por el bot', caseN: 'Caso {n}',
      ofLimit: '{n} de {limit}', forever: 'Para siempre', permanent: 'Ban permanente', nextMute: 'Con {limit} advertencias en 30 días: silencio de 1 hora.',
      escalated: 'Advertencia {n} de {n}: silenciado por {d}. El contador empieza de nuevo.', escalatedBlocked: 'Advertencia {n} de {n}. El contador empieza de nuevo.',
      tally: 'Cuenta', untilLabel: 'Hasta', lifts: 'Termina', banWord: 'ban', status: 'Estado', notApplied: 'No aplicado: {why}',
      ownerBlocked: 'no se puede silenciar ni banear al dueño del servidor', adminBlocked: 'no se puede silenciar a los administradores',
      failed: 'Error: el bot no tiene permiso', canTalk: 'Puede hablar de nuevo', backIn: 'Puede volver a entrar al servidor', clean: 'Historial limpio',
      mistake: '¿Crees que el bot se equivocó? Escribe al dueño.', warnsAddShort: 'Las advertencias se acumulan: 3 en 30 días dan un silencio de 1 hora.',
      updated: 'Actualizado {d}', actNone: 'ELIMINADO', actWarn: 'ADVERTENCIA', actMute: 'SILENCIO {d}', actBan: 'BAN {d}',
      serversTitle: 'Servidores', onlineN: '{n} en línea', noRoomsNow: 'No hay salas ahora. Pulsa Jugar y se abre una nueva.', stOpen: 'abierta', stFull: 'llena',
      stFreeing: 'se libera un hueco', phHiding: 'Escondiéndose', phHunt: 'Caza', phStory: 'Historia terminada', leftT: 'quedan {t}', mapN: 'mapa {m}',
      moreRooms: '+ {n} salas más', refresh: 'Actualizar', playNow: 'Jugar', gRaceMode: 'Carrera', gHnsMode: 'Escondite', playersN: '{n} jugadores',
      playerN: '1 jugador', roomsN: '{n} salas', roomN: '1 sala', upTo40: 'hasta 40 jugadores cada una',
      openProfile: 'Abrir perfil', tabProfile: 'Perfil', tabMaps: 'Mapas', tabFriends: 'Amigos', perToday: 'Hoy', perWeek: 'Esta semana', perAll: 'Siempre',
      joined: 'Se unió el {d}', coinsL: 'Monedas', raceScores: 'Puntos de carrera', hsScores: 'Puntos de escondite', noRank: 'sin rango', aboutL: 'Sobre mí',
      nothingWritten: 'Aún no hay nada escrito', todayWord: 'hoy', weekWord: 'esta semana', noMapsYet: 'Aún no hay mapas publicados', noFriendsYet: 'Aún no hay amigos',
      published: 'Publicado el {d}', inGameTag: 'en el juego', likesN: 'me gusta {a} · no me gusta {b}', onlineNowTag: 'en línea ahora', minAgo: 'hace {n} min',
      hAgo: 'hace {n} h', dAgo: 'hace {n} días', longAgo: 'hace mucho', friendsL: 'Amigos', mapsL: 'Mapas', moreN2: '+ {n} más', race: 'Carrera', hns: 'Escondite',
      myLang: 'Mi idioma', rulesTitle: 'Reglas del servidor AIBROFIST'
    },
    rules: ['Sin spam', 'Sin invitaciones a otros servidores de Discord', 'Sin contenido para adultos', 'Sin discurso de odio', 'Sin estafas ni enlaces peligrosos',
            'No vender cuentas ni monedas por dinero real', 'Sin direcciones IP de otras personas'],
    short: ['Más de 3 mensajes en 2 segundos. Silencio a la 5.ª vez.', 'Se borra el mensaje y recibes una advertencia.', 'Imágenes, enlaces y texto.',
            'Insultos y decirle a alguien que se haga daño.', 'Phishing, Nitro falso, rastreadores de IP, .exe. El único ban.',
            'Se borra el mensaje y recibes una advertencia.', 'Se borra el mensaje, sin castigo.'],
    notes: { flood: 'Más de 3 mensajes en 2 segundos', invite: 'Invitación a otro servidor', 'nsfw-link': 'Enlace a un sitio +18', 'nsfw-image': 'Imagen +18',
             slur: 'Insultos o discurso de odio', selfharm: 'Incitación a hacerse daño', 'scam-text': 'Mensaje de estafa conocido', 'everyone-link': 'Mención masiva con enlace',
             badfile: 'Archivo ejecutable', scam: 'Enlace de estafa o phishing', grabber: 'Enlace que roba la dirección IP', cheat: 'Venta por dinero real',
             custom: 'Palabra prohibida en este servidor', 'native-word': 'Bloqueado por una regla de AutoMod del servidor', warns: '3 advertencias en 30 días' },
    units: { plural: 'one', min: ['minuto', 'minutos'], hour: ['hora', 'horas'], day: ['día', 'días'] }
  },

  /* ---------- português (Brasil) ---------- */
  pt: {
    name: 'Português', locale: 'pt-BR',
    s: {
      warn: 'Aviso', mute: 'Silenciado', ban: 'Banido', unmute: 'Silêncio removido', unban: 'Banimento removido', unwarn: 'Avisos removidos',
      removed: 'Mensagem removida', rule: 'Regra', reason: 'Motivo', other: 'Outro', customWords: 'Palavras proibidas neste servidor',
      nativeWord: 'Regra do AutoMod do servidor', noReason: 'Sem motivo informado', by: 'Aplicado por {who}', byBot: 'Automático, pelo bot', caseN: 'Caso {n}',
      ofLimit: '{n} de {limit}', forever: 'Para sempre', permanent: 'Banimento permanente', nextMute: 'Com {limit} avisos em 30 dias: silêncio de 1 hora.',
      escalated: 'Aviso {n} de {n}: silenciado por {d}. A contagem recomeça.', escalatedBlocked: 'Aviso {n} de {n}. A contagem recomeça.',
      tally: 'Contagem', untilLabel: 'Até', lifts: 'Termina', banWord: 'banimento', status: 'Status', notApplied: 'Não aplicado: {why}',
      ownerBlocked: 'o dono do servidor não pode ser silenciado nem banido', adminBlocked: 'administradores não podem ser silenciados',
      failed: 'Falhou: o bot não tem permissão', canTalk: 'Pode falar de novo', backIn: 'Pode entrar no servidor de novo', clean: 'Ficha limpa agora',
      mistake: 'Acha que o bot errou? Fale com o dono.', warnsAddShort: 'Os avisos se acumulam: 3 em 30 dias dão um silêncio de 1 hora.',
      updated: 'Atualizado em {d}', actNone: 'REMOVIDA', actWarn: 'AVISO', actMute: 'SILÊNCIO {d}', actBan: 'BAN {d}',
      serversTitle: 'Servidores', onlineN: '{n} online', noRoomsNow: 'Nenhuma sala agora. Toque em Jogar e uma nova sala abre.', stOpen: 'aberta', stFull: 'cheia',
      stFreeing: 'uma vaga está abrindo', phHiding: 'Escondendo', phHunt: 'Caça', phStory: 'História encerrada', leftT: 'restam {t}', mapN: 'mapa {m}',
      moreRooms: '+ {n} salas', refresh: 'Atualizar', playNow: 'Jogar', gRaceMode: 'Corrida', gHnsMode: 'Esconde-esconde', playersN: '{n} jogadores',
      playerN: '1 jogador', roomsN: '{n} salas', roomN: '1 sala', upTo40: 'até 40 jogadores cada',
      openProfile: 'Abrir perfil', tabProfile: 'Perfil', tabMaps: 'Mapas', tabFriends: 'Amigos', perToday: 'Hoje', perWeek: 'Esta semana', perAll: 'Sempre',
      joined: 'Entrou em {d}', coinsL: 'Moedas', raceScores: 'Pontos de corrida', hsScores: 'Pontos de esconde-esconde', noRank: 'sem rank', aboutL: 'Sobre',
      nothingWritten: 'Nada escrito ainda', todayWord: 'hoje', weekWord: 'esta semana', noMapsYet: 'Nenhum mapa publicado ainda', noFriendsYet: 'Nenhum amigo ainda',
      published: 'Publicado em {d}', inGameTag: 'no jogo', likesN: 'curtidas {a} · descurtidas {b}', onlineNowTag: 'online agora', minAgo: 'há {n} min',
      hAgo: 'há {n} h', dAgo: 'há {n} dias', longAgo: 'há muito tempo', friendsL: 'Amigos', mapsL: 'Mapas', moreN2: '+ {n}', race: 'Corrida', hns: 'Esconde-esconde',
      myLang: 'Meu idioma', rulesTitle: 'Regras do servidor AIBROFIST'
    },
    rules: ['Sem spam', 'Sem convites para outros servidores do Discord', 'Sem conteúdo adulto', 'Sem discurso de ódio', 'Sem golpes nem links perigosos',
            'Não venda contas nem moedas por dinheiro real', 'Sem endereços IP de outras pessoas'],
    short: ['Mais de 3 mensagens em 2 segundos. Silêncio na 5ª vez.', 'A mensagem é apagada e você recebe um aviso.', 'Imagens, links e texto.',
            'Ofensas e mandar alguém se machucar.', 'Phishing, Nitro falso, rastreadores de IP, .exe. O único ban.',
            'A mensagem é apagada e você recebe um aviso.', 'A mensagem é apagada, sem punição.'],
    notes: { flood: 'Mais de 3 mensagens em 2 segundos', invite: 'Convite para outro servidor', 'nsfw-link': 'Link para site +18', 'nsfw-image': 'Imagem +18',
             slur: 'Ofensa ou discurso de ódio', selfharm: 'Incentivo à automutilação', 'scam-text': 'Mensagem de golpe conhecida', 'everyone-link': 'Menção em massa com link',
             badfile: 'Arquivo executável', scam: 'Link de golpe ou phishing', grabber: 'Link que rouba o endereço IP', cheat: 'Venda por dinheiro real',
             custom: 'Palavra proibida neste servidor', 'native-word': 'Bloqueado por uma regra do AutoMod do servidor', warns: '3 avisos em 30 dias' },
    units: { plural: 'one', min: ['minuto', 'minutos'], hour: ['hora', 'horas'], day: ['dia', 'dias'] }
  },

  /* ---------- Deutsch ---------- */
  de: {
    name: 'Deutsch', locale: 'de',
    s: {
      warn: 'Verwarnung', mute: 'Stummgeschaltet', ban: 'Gebannt', unmute: 'Stummschaltung aufgehoben', unban: 'Bann aufgehoben', unwarn: 'Verwarnungen entfernt',
      removed: 'Nachricht entfernt', rule: 'Regel', reason: 'Grund', other: 'Sonstiges', customWords: 'Auf diesem Server verbotene Wörter',
      nativeWord: 'AutoMod-Regel des Servers', noReason: 'Kein Grund angegeben', by: 'Von {who}', byBot: 'Automatisch, durch den Bot', caseN: 'Fall {n}',
      ofLimit: '{n} von {limit}', forever: 'Für immer', permanent: 'Dauerhafter Bann', nextMute: 'Bei {limit} Verwarnungen innerhalb von 30 Tagen gibt es 1 Stunde Stummschaltung.',
      escalated: 'Verwarnung {n} von {n}: für {d} stummgeschaltet. Der Zähler beginnt von vorn.', escalatedBlocked: 'Verwarnung {n} von {n}. Der Zähler beginnt von vorn.',
      tally: 'Zähler', untilLabel: 'Bis', lifts: 'Endet', banWord: 'Bann', status: 'Status', notApplied: 'Nicht angewendet: {why}',
      ownerBlocked: 'der Serverbesitzer kann nicht stummgeschaltet oder gebannt werden', adminBlocked: 'Administratoren können nicht stummgeschaltet werden',
      failed: 'Fehlgeschlagen: Der Bot hat keine Berechtigung', canTalk: 'Darf wieder schreiben', backIn: 'Darf dem Server wieder beitreten',
      clean: 'Jetzt keine Verwarnungen mehr', mistake: 'Der Bot hat sich geirrt? Schreib dem Besitzer.',
      warnsAddShort: 'Verwarnungen summieren sich: 3 innerhalb von 30 Tagen ergeben 1 Stunde Stummschaltung.',
      updated: 'Aktualisiert am {d}', actNone: 'ENTFERNT', actWarn: 'VERWARNUNG', actMute: 'STUMM {d}', actBan: 'BANN {d}',
      serversTitle: 'Server', onlineN: '{n} online', noRoomsNow: 'Gerade keine Räume. Tippe auf Spielen, dann öffnet sich ein neuer.', stOpen: 'offen', stFull: 'voll',
      stFreeing: 'ein Platz wird frei', phHiding: 'Verstecken', phHunt: 'Jagd', phStory: 'Story beendet', leftT: 'noch {t}', mapN: 'Karte {m}',
      moreRooms: '+ {n} weitere Räume', refresh: 'Aktualisieren', playNow: 'Spielen', gRaceMode: 'Rennen', gHnsMode: 'Verstecken', playersN: '{n} Spieler',
      playerN: '1 Spieler', roomsN: '{n} Räume', roomN: '1 Raum', upTo40: 'je bis zu 40 Spieler',
      openProfile: 'Profil öffnen', tabProfile: 'Profil', tabMaps: 'Karten', tabFriends: 'Freunde', perToday: 'Heute', perWeek: 'Diese Woche', perAll: 'Gesamt',
      joined: 'Beigetreten am {d}', coinsL: 'Münzen', raceScores: 'Rennpunkte', hsScores: 'Versteck-Punkte', noRank: 'kein Rang', aboutL: 'Über mich',
      nothingWritten: 'Noch nichts geschrieben', todayWord: 'heute', weekWord: 'diese Woche', noMapsYet: 'Noch keine Karten veröffentlicht', noFriendsYet: 'Noch keine Freunde',
      published: 'Veröffentlicht am {d}', inGameTag: 'im Spiel', likesN: 'Likes {a} · Dislikes {b}', onlineNowTag: 'gerade online', minAgo: 'vor {n} Min.',
      hAgo: 'vor {n} Std.', dAgo: 'vor {n} Tagen', longAgo: 'vor langer Zeit', friendsL: 'Freunde', mapsL: 'Karten', moreN2: '+ {n} weitere', race: 'Rennen',
      hns: 'Verstecken', myLang: 'Meine Sprache', rulesTitle: 'Serverregeln von AIBROFIST'
    },
    rules: ['Kein Spam', 'Keine Einladungen zu anderen Discord-Servern', 'Keine Inhalte für Erwachsene', 'Keine Hassrede', 'Kein Betrug und keine gefährlichen Links',
            'Kein Verkauf von Konten oder Münzen für echtes Geld', 'Keine fremden IP-Adressen'],
    short: ['Mehr als 3 Nachrichten in 2 Sekunden. Beim 5. Mal Stummschaltung.', 'Die Nachricht wird gelöscht, du bekommst eine Verwarnung.', 'Bilder, Links und Text.',
            'Beleidigungen und Aufforderungen, sich etwas anzutun.', 'Phishing, Fake-Nitro, IP-Grabber, .exe. Der einzige Bann.',
            'Die Nachricht wird gelöscht, du bekommst eine Verwarnung.', 'Die Nachricht wird gelöscht, keine Strafe.'],
    notes: { flood: 'Mehr als 3 Nachrichten in 2 Sekunden', invite: 'Einladung zu einem anderen Server', 'nsfw-link': 'Link zu einer 18+-Seite', 'nsfw-image': '18+-Bild',
             slur: 'Beleidigung oder Hassrede', selfharm: 'Aufruf zur Selbstverletzung', 'scam-text': 'Bekannte Betrugsnachricht', 'everyone-link': 'Massenerwähnung mit Link',
             badfile: 'Ausführbare Datei', scam: 'Betrugs- oder Phishing-Link', grabber: 'Link, der die IP-Adresse stiehlt', cheat: 'Verkauf für echtes Geld',
             custom: 'Auf diesem Server verbotenes Wort', 'native-word': 'Von einer AutoMod-Regel des Servers blockiert', warns: '3 Verwarnungen in 30 Tagen' },
    units: { plural: 'one', min: ['Minute', 'Minuten'], hour: ['Stunde', 'Stunden'], day: ['Tag', 'Tage'] }
  },

  /* ---------- français ---------- */
  fr: {
    name: 'Français', locale: 'fr',
    s: {
      warn: 'Avertissement', mute: 'Muet', ban: 'Banni', unmute: 'Mute levé', unban: 'Bannissement levé', unwarn: 'Avertissements retirés',
      removed: 'Message supprimé', rule: 'Règle', reason: 'Raison', other: 'Autre', customWords: 'Mots interdits sur ce serveur',
      nativeWord: 'Règle AutoMod du serveur', noReason: 'Aucune raison indiquée', by: 'Émis par {who}', byBot: 'Automatique, par le bot', caseN: 'Cas {n}',
      ofLimit: '{n} sur {limit}', forever: 'Pour toujours', permanent: 'Bannissement permanent', nextMute: 'À {limit} avertissements en 30 jours : mute d’1 heure.',
      escalated: 'Avertissement {n} sur {n} : mute de {d}. Le compteur repart à zéro.', escalatedBlocked: 'Avertissement {n} sur {n}. Le compteur repart à zéro.',
      tally: 'Compteur', untilLabel: 'Jusqu’au', lifts: 'Se termine', banWord: 'ban', status: 'Statut', notApplied: 'Non appliqué : {why}',
      ownerBlocked: 'le propriétaire du serveur ne peut pas être mis en muet ni banni', adminBlocked: 'les administrateurs ne peuvent pas être mis en muet',
      failed: 'Échec : le bot n’a pas la permission', canTalk: 'Peut de nouveau parler', backIn: 'Peut de nouveau rejoindre le serveur', clean: 'Casier vierge',
      mistake: 'Le bot s’est trompé ? Écris au propriétaire.', warnsAddShort: 'Les avertissements s’additionnent : 3 en 30 jours = mute d’1 heure.',
      updated: 'Mis à jour le {d}', actNone: 'SUPPRIMÉ', actWarn: 'AVERTISSEMENT', actMute: 'MUTE {d}', actBan: 'BAN {d}',
      serversTitle: 'Serveurs', onlineN: '{n} en ligne', noRoomsNow: 'Aucun salon pour le moment. Appuie sur Jouer et un nouveau s’ouvre.', stOpen: 'ouvert', stFull: 'plein',
      stFreeing: 'une place se libère', phHiding: 'Cachette', phHunt: 'Chasse', phStory: 'Histoire terminée', leftT: '{t} restantes', mapN: 'carte {m}',
      moreRooms: '+ {n} salons de plus', refresh: 'Actualiser', playNow: 'Jouer', gRaceMode: 'Course', gHnsMode: 'Cache-cache', playersN: '{n} joueurs',
      playerN: '1 joueur', roomsN: '{n} salons', roomN: '1 salon', upTo40: 'jusqu’à 40 joueurs chacun',
      openProfile: 'Ouvrir le profil', tabProfile: 'Profil', tabMaps: 'Cartes', tabFriends: 'Amis', perToday: 'Aujourd’hui', perWeek: 'Cette semaine', perAll: 'Total',
      joined: 'Inscrit le {d}', coinsL: 'Pièces', raceScores: 'Points de course', hsScores: 'Points de cache-cache', noRank: 'sans rang', aboutL: 'À propos',
      nothingWritten: 'Rien d’écrit pour l’instant', todayWord: 'aujourd’hui', weekWord: 'cette semaine', noMapsYet: 'Aucune carte publiée', noFriendsYet: 'Pas encore d’amis',
      published: 'Publiée le {d}', inGameTag: 'en jeu', likesN: 'j’aime {a} · je n’aime pas {b}', onlineNowTag: 'en ligne', minAgo: 'il y a {n} min',
      hAgo: 'il y a {n} h', dAgo: 'il y a {n} j', longAgo: 'il y a longtemps', friendsL: 'Amis', mapsL: 'Cartes', moreN2: '+ {n} de plus', race: 'Course',
      hns: 'Cache-cache', myLang: 'Ma langue', rulesTitle: 'Règles du serveur AIBROFIST'
    },
    rules: ['Pas de spam', 'Pas d’invitations vers d’autres serveurs Discord', 'Pas de contenu adulte', 'Pas de discours haineux', 'Pas d’arnaques ni de liens dangereux',
            'Pas de vente de comptes ou de pièces contre de l’argent réel', 'Pas d’adresses IP d’autres personnes'],
    short: ['Plus de 3 messages en 2 secondes. Mute à la 5e fois.', 'Message supprimé, tu reçois un avertissement.', 'Images, liens et texte.',
            'Insultes et inciter quelqu’un à se faire du mal.', 'Phishing, faux Nitro, IP grabbers, .exe. Le seul ban.',
            'Message supprimé, tu reçois un avertissement.', 'Message supprimé, sans sanction.'],
    notes: { flood: 'Plus de 3 messages en 2 secondes', invite: 'Invitation vers un autre serveur', 'nsfw-link': 'Lien vers un site 18+', 'nsfw-image': 'Image 18+',
             slur: 'Insulte ou discours haineux', selfharm: 'Incitation à se faire du mal', 'scam-text': 'Message d’arnaque connu', 'everyone-link': 'Mention de masse avec un lien',
             badfile: 'Fichier exécutable', scam: 'Lien d’arnaque ou d’hameçonnage', grabber: 'Lien qui vole l’adresse IP', cheat: 'Vente contre de l’argent réel',
             custom: 'Mot interdit sur ce serveur', 'native-word': 'Bloqué par une règle AutoMod du serveur', warns: '3 avertissements en 30 jours' },
    units: { plural: 'one', min: ['minute', 'minutes'], hour: ['heure', 'heures'], day: ['jour', 'jours'] }
  },

  /* ---------- Türkçe ---------- */
  tr: {
    name: 'Türkçe', locale: 'tr',
    s: {
      warn: 'Uyarı', mute: 'Susturuldu', ban: 'Yasaklandı', unmute: 'Susturma kaldırıldı', unban: 'Yasak kaldırıldı', unwarn: 'Uyarılar silindi',
      removed: 'Mesaj silindi', rule: 'Kural', reason: 'Sebep', other: 'Diğer', customWords: 'Bu sunucuda yasak kelimeler',
      nativeWord: 'Sunucunun AutoMod kuralı', noReason: 'Sebep belirtilmedi', by: 'Veren: {who}', byBot: 'Otomatik, bot tarafından', caseN: 'Vaka {n}',
      ofLimit: '{n} / {limit}', forever: 'Süresiz', permanent: 'Kalıcı yasak', nextMute: '30 gün içinde {limit} uyarı alırsan 1 saat susturulursun.',
      escalated: 'Uyarı {n} / {n}: {d} susturuldu. Sayaç sıfırlanır.', escalatedBlocked: 'Uyarı {n} / {n}. Sayaç sıfırlanır.',
      tally: 'Sayaç', untilLabel: 'Bitiş', lifts: 'Biter', banWord: 'yasak', status: 'Durum', notApplied: 'Uygulanmadı: {why}',
      ownerBlocked: 'sunucu sahibi susturulamaz veya yasaklanamaz', adminBlocked: 'yöneticiler susturulamaz',
      failed: 'Başarısız: botun yetkisi yok', canTalk: 'Tekrar konuşabilir', backIn: 'Sunucuya tekrar katılabilir', clean: 'Artık sicil temiz',
      mistake: 'Bot hata mı yaptı? Sunucu sahibine yaz.', warnsAddShort: 'Uyarılar birikir: 30 gün içinde 3 uyarı 1 saat susturma verir.',
      updated: '{d} tarihinde güncellendi', actNone: 'SİLİNİR', actWarn: 'UYARI', actMute: 'SUSTURMA {d}', actBan: 'YASAK {d}',
      serversTitle: 'Sunucular', onlineN: '{n} çevrimiçi', noRoomsNow: 'Şu an oda yok. Oyna’ya bas, yeni bir oda açılır.', stOpen: 'açık', stFull: 'dolu',
      stFreeing: 'bir yer boşalıyor', phHiding: 'Saklanma', phHunt: 'Av', phStory: 'Hikâye bitti', leftT: '{t} kaldı', mapN: 'harita {m}',
      moreRooms: '+ {n} oda daha', refresh: 'Yenile', playNow: 'Oyna', gRaceMode: 'Yarış', gHnsMode: 'Saklambaç', playersN: '{n} oyuncu',
      playerN: '1 oyuncu', roomsN: '{n} oda', roomN: '1 oda', upTo40: 'her biri en fazla 40 oyuncu',
      openProfile: 'Profili aç', tabProfile: 'Profil', tabMaps: 'Haritalar', tabFriends: 'Arkadaşlar', perToday: 'Bugün', perWeek: 'Bu hafta', perAll: 'Tüm zamanlar',
      joined: 'Katılma: {d}', coinsL: 'Jeton', raceScores: 'Yarış puanı', hsScores: 'Saklambaç puanı', noRank: 'sıralama yok', aboutL: 'Hakkında',
      nothingWritten: 'Henüz bir şey yazılmamış', todayWord: 'bugün', weekWord: 'bu hafta', noMapsYet: 'Henüz yayınlanmış harita yok', noFriendsYet: 'Henüz arkadaş yok',
      published: 'Yayın: {d}', inGameTag: 'oyunda', likesN: 'beğeni {a} · beğenmeme {b}', onlineNowTag: 'şu an çevrimiçi', minAgo: '{n} dk önce',
      hAgo: '{n} sa önce', dAgo: '{n} gün önce', longAgo: 'uzun zaman önce', friendsL: 'Arkadaşlar', mapsL: 'Haritalar', moreN2: '+ {n} daha', race: 'Yarış',
      hns: 'Saklambaç', myLang: 'Dilim', rulesTitle: 'AIBROFIST Sunucu Kuralları'
    },
    rules: ['Spam yok', 'Başka Discord sunucularına davet yok', 'Yetişkin içerik yok', 'Nefret söylemi yok', 'Dolandırıcılık ve tehlikeli bağlantı yok',
            'Hesap veya jetonları gerçek paraya satmak yasak', 'Başkalarının IP adresleri yok'],
    short: ['2 saniyede 3’ten fazla mesaj. 5. seferde susturma.', 'Mesaj silinir, uyarı alırsın.', 'Resimler, bağlantılar ve metin.',
            'Hakaret ve birine kendine zarar vermesini söylemek.', 'Oltalama, sahte Nitro, IP yakalayıcılar, .exe. Tek yasak sebebi.',
            'Mesaj silinir, uyarı alırsın.', 'Mesaj silinir, ceza yok.'],
    notes: { flood: '2 saniyede 3’ten fazla mesaj', invite: 'Başka bir sunucuya davet', 'nsfw-link': '18+ siteye bağlantı', 'nsfw-image': '18+ resim',
             slur: 'Hakaret veya nefret söylemi', selfharm: 'Kendine zarar vermeye çağrı', 'scam-text': 'Bilinen dolandırıcılık mesajı', 'everyone-link': 'Bağlantılı toplu etiket',
             badfile: 'Çalıştırılabilir dosya', scam: 'Dolandırıcılık veya oltalama bağlantısı', grabber: 'IP adresini çalan bağlantı', cheat: 'Gerçek paraya satış',
             custom: 'Bu sunucuda yasak kelime', 'native-word': 'Sunucunun AutoMod kuralı engelledi', warns: '30 günde 3 uyarı' },
    units: { plural: 'none', min: ['dakika'], hour: ['saat'], day: ['gün'] }
  },

  /* ---------- polski ---------- */
  pl: {
    name: 'Polski', locale: 'pl',
    s: {
      warn: 'Ostrzeżenie', mute: 'Wyciszony', ban: 'Zbanowany', unmute: 'Wyciszenie zdjęte', unban: 'Ban zdjęty', unwarn: 'Ostrzeżenia usunięte',
      removed: 'Wiadomość usunięta', rule: 'Zasada', reason: 'Powód', other: 'Inne', customWords: 'Słowa zakazane na tym serwerze',
      nativeWord: 'Reguła AutoMod serwera', noReason: 'Nie podano powodu', by: 'Wystawione przez {who}', byBot: 'Automatycznie, przez bota', caseN: 'Sprawa {n}',
      ofLimit: '{n} z {limit}', forever: 'Na zawsze', permanent: 'Ban permanentny', nextMute: 'Przy {limit} ostrzeżeniach w ciągu 30 dni: wyciszenie na 1 godzinę.',
      escalated: 'Ostrzeżenie {n} z {n}: wyciszenie na {d}. Licznik zaczyna się od nowa.', escalatedBlocked: 'Ostrzeżenie {n} z {n}. Licznik zaczyna się od nowa.',
      tally: 'Licznik', untilLabel: 'Do', lifts: 'Kończy się', banWord: 'ban', status: 'Status', notApplied: 'Nie zastosowano: {why}',
      ownerBlocked: 'właściciela serwera nie można wyciszyć ani zbanować', adminBlocked: 'administratorów nie można wyciszyć',
      failed: 'Niepowodzenie: bot nie ma uprawnień', canTalk: 'Może znowu pisać', backIn: 'Może znowu dołączyć do serwera', clean: 'Czysta historia',
      mistake: 'Bot się pomylił? Napisz do właściciela.', warnsAddShort: 'Ostrzeżenia się sumują: 3 w ciągu 30 dni dają wyciszenie na 1 godzinę.',
      updated: 'Zaktualizowano {d}', actNone: 'USUNIĘTO', actWarn: 'OSTRZEŻENIE', actMute: 'WYCISZENIE {d}', actBan: 'BAN {d}',
      serversTitle: 'Serwery', onlineN: 'online: {n}', noRoomsNow: 'Teraz brak pokoi. Naciśnij Graj, a otworzy się nowy.', stOpen: 'otwarty', stFull: 'pełny',
      stFreeing: 'zwalnia się miejsce', phHiding: 'Chowanie', phHunt: 'Polowanie', phStory: 'Fabuła zakończona', leftT: 'zostało {t}', mapN: 'mapa {m}',
      moreRooms: '+ {n} pokoi więcej', refresh: 'Odśwież', playNow: 'Graj', gRaceMode: 'Wyścig', gHnsMode: 'Chowany', playersN: 'graczy: {n}',
      playerN: '1 gracz', roomsN: 'pokoi: {n}', roomN: '1 pokój', upTo40: 'do 40 graczy w każdym',
      openProfile: 'Otwórz profil', tabProfile: 'Profil', tabMaps: 'Mapy', tabFriends: 'Znajomi', perToday: 'Dziś', perWeek: 'Ten tydzień', perAll: 'Cały czas',
      joined: 'Data dołączenia: {d}', coinsL: 'Monety', raceScores: 'Punkty z wyścigów', hsScores: 'Punkty z chowanego', noRank: 'brak rangi', aboutL: 'O mnie',
      nothingWritten: 'Jeszcze nic nie napisano', todayWord: 'dziś', weekWord: 'w tym tygodniu', noMapsYet: 'Brak opublikowanych map', noFriendsYet: 'Brak znajomych',
      published: 'Opublikowano {d}', inGameTag: 'w grze', likesN: 'polubienia {a} · niepolubienia {b}', onlineNowTag: 'teraz online', minAgo: '{n} min temu',
      hAgo: '{n} godz. temu', dAgo: '{n} dni temu', longAgo: 'dawno temu', friendsL: 'Znajomi', mapsL: 'Mapy', moreN2: '+ {n} więcej', race: 'Wyścig',
      hns: 'Chowany', myLang: 'Mój język', rulesTitle: 'Regulamin serwera AIBROFIST'
    },
    rules: ['Zakaz spamu', 'Zakaz zaproszeń na inne serwery Discord', 'Zakaz treści dla dorosłych', 'Zakaz mowy nienawiści', 'Zakaz oszustw i niebezpiecznych linków',
            'Zakaz sprzedaży kont i monet za prawdziwe pieniądze', 'Zakaz podawania cudzych adresów IP'],
    short: ['Ponad 3 wiadomości w 2 sekundy. Za 5. razem wyciszenie.', 'Wiadomość jest usuwana, dostajesz ostrzeżenie.', 'Obrazy, linki i tekst.',
            'Obelgi i namawianie kogoś do zrobienia sobie krzywdy.', 'Phishing, fałszywe Nitro, IP grabbery, .exe. Jedyny ban.',
            'Wiadomość jest usuwana, dostajesz ostrzeżenie.', 'Wiadomość jest usuwana, bez kary.'],
    notes: { flood: 'Ponad 3 wiadomości w 2 sekundy', invite: 'Zaproszenie na inny serwer', 'nsfw-link': 'Link do strony 18+', 'nsfw-image': 'Obraz 18+',
             slur: 'Obelga lub mowa nienawiści', selfharm: 'Namawianie do zrobienia sobie krzywdy', 'scam-text': 'Znana wiadomość oszukańcza', 'everyone-link': 'Masowe oznaczenie z linkiem',
             badfile: 'Plik wykonywalny', scam: 'Link oszukańczy lub phishingowy', grabber: 'Link kradnący adres IP', cheat: 'Sprzedaż za prawdziwe pieniądze',
             custom: 'Słowo zakazane na tym serwerze', 'native-word': 'Zablokowane przez regułę AutoMod serwera', warns: '3 ostrzeżenia w 30 dni' },
    units: { plural: 'pl', min: ['minuta', 'minuty', 'minut'], hour: ['godzina', 'godziny', 'godzin'], day: ['dzień', 'dni', 'dni'] }
  },

  /* ---------- українська ---------- */
  uk: {
    name: 'Українська', locale: 'uk',
    s: {
      warn: 'Попередження', mute: 'М’ют', ban: 'Бан', unmute: 'М’ют знято', unban: 'Бан знято', unwarn: 'Попередження зняті',
      removed: 'Повідомлення видалено', rule: 'Правило', reason: 'Причина', other: 'Інше', customWords: 'Слова, заборонені на сервері',
      nativeWord: 'Правило AutoMod сервера', noReason: 'Причину не вказано', by: 'Видав {who}', byBot: 'Автоматично, ботом', caseN: 'Випадок {n}',
      ofLimit: '{n} з {limit}', forever: 'Назавжди', permanent: 'Бан назавжди', nextMute: '{limit} попередження за 30 днів — м’ют на 1 годину.',
      escalated: 'Попередження {n} з {n}: м’ют на {d}. Лічильник починається заново.', escalatedBlocked: 'Попередження {n} з {n}. Лічильник починається заново.',
      tally: 'Лічильник', untilLabel: 'До', lifts: 'Закінчиться', banWord: 'бан', status: 'Статус', notApplied: 'Не застосовано: {why}',
      ownerBlocked: 'власника сервера не можна замʼютити чи забанити', adminBlocked: 'адміністраторів не можна замʼютити',
      failed: 'Не вийшло: у бота немає прав', canTalk: 'Знову може писати', backIn: 'Знову може зайти на сервер', clean: 'Тепер без попереджень',
      mistake: 'Бот помилився? Напишіть власнику.', warnsAddShort: 'Попередження накопичуються: 3-є за 30 днів дає м’ют на 1 годину.',
      updated: 'Оновлено {d}', actNone: 'ВИДАЛЯЄТЬСЯ', actWarn: 'ПОПЕРЕДЖЕННЯ', actMute: 'М’ЮТ {d}', actBan: 'БАН {d}',
      serversTitle: 'Сервери', onlineN: 'онлайн: {n}', noRoomsNow: 'Зараз кімнат немає. Натисніть «Грати» — відкриється нова.', stOpen: 'відкрита', stFull: 'повна',
      stFreeing: 'звільняється місце', phHiding: 'Ховаються', phHunt: 'Полювання', phStory: 'Сюжет закінчено', leftT: 'залишилось {t}', mapN: 'мапа {m}',
      moreRooms: '+ ще кімнат: {n}', refresh: 'Оновити', playNow: 'Грати', gRaceMode: 'Перегони', gHnsMode: 'Хованки', playersN: '{n} грав.',
      playerN: '1 гравець', roomsN: '{n} кімн.', roomN: '1 кімната', upTo40: 'до 40 гравців у кожній',
      openProfile: 'Відкрити профіль', tabProfile: 'Профіль', tabMaps: 'Мапи', tabFriends: 'Друзі', perToday: 'Сьогодні', perWeek: 'За тиждень', perAll: 'За весь час',
      joined: 'Реєстрація: {d}', coinsL: 'Монети', raceScores: 'Очки перегонів', hsScores: 'Очки хованок', noRank: 'немає рангу', aboutL: 'Про себе',
      nothingWritten: 'Нічого не написано', todayWord: 'сьогодні', weekWord: 'за тиждень', noMapsYet: 'Мап поки немає', noFriendsYet: 'Друзів поки немає',
      published: 'Опубліковано {d}', inGameTag: 'у грі', likesN: 'подобається {a} · не подобається {b}', onlineNowTag: 'зараз онлайн', minAgo: '{n} хв тому',
      hAgo: '{n} год тому', dAgo: '{n} дн. тому', longAgo: 'давно', friendsL: 'Друзі', mapsL: 'Мапи', moreN2: '+ ще {n}', race: 'Перегони',
      hns: 'Хованки', myLang: 'Моя мова', rulesTitle: 'Правила сервера AIBROFIST'
    },
    rules: ['Без спаму', 'Без запрошень на інші Discord-сервери', 'Без контенту 18+', 'Без мови ворожнечі', 'Без шахрайства та небезпечних посилань',
            'Без продажу акаунтів і монет за реальні гроші', 'Без чужих IP-адрес'],
    short: ['Понад 3 повідомлення за 2 секунди. М’ют на 5-й раз.', 'Повідомлення видаляється, ви отримуєте попередження.', 'Зображення, посилання та текст.',
            'Образи та заклики завдати собі шкоди.', 'Фішинг, фейк-Nitro, IP-логери, exe. Єдиний бан.',
            'Повідомлення видаляється, ви отримуєте попередження.', 'Повідомлення видаляється, без покарання.'],
    notes: { flood: 'Понад 3 повідомлення за 2 секунди', invite: 'Запрошення на інший сервер', 'nsfw-link': 'Посилання на сайт 18+', 'nsfw-image': 'Зображення 18+',
             slur: 'Образа або мова ворожнечі', selfharm: 'Заклик завдати собі шкоди', 'scam-text': 'Відоме шахрайське повідомлення', 'everyone-link': 'Масове згадування з посиланням',
             badfile: 'Виконуваний файл', scam: 'Шахрайське або фішингове посилання', grabber: 'Посилання, що краде IP-адресу', cheat: 'Торгівля за реальні гроші',
             custom: 'Слово, заборонене на цьому сервері', 'native-word': 'Заблоковано правилом AutoMod сервера', warns: '3 попередження за 30 днів' },
    units: { plural: 'slavic', min: ['хвилина', 'хвилини', 'хвилин'], hour: ['година', 'години', 'годин'], day: ['день', 'дні', 'днів'] }
  },

  /* ---------- italiano ---------- */
  it: {
    name: 'Italiano', locale: 'it',
    s: {
      warn: 'Avviso', mute: 'Silenziato', ban: 'Bannato', unmute: 'Silenziamento revocato', unban: 'Ban revocato', unwarn: 'Avvisi rimossi',
      removed: 'Messaggio rimosso', rule: 'Regola', reason: 'Motivo', other: 'Altro', customWords: 'Parole vietate su questo server',
      nativeWord: 'Regola AutoMod del server', noReason: 'Nessun motivo indicato', by: 'Emesso da {who}', byBot: 'Automatico, dal bot', caseN: 'Caso {n}',
      ofLimit: '{n} su {limit}', forever: 'Per sempre', permanent: 'Ban permanente', nextMute: 'Con {limit} avvisi in 30 giorni: silenziamento di 1 ora.',
      escalated: 'Avviso {n} su {n}: silenziato per {d}. Il conteggio riparte da zero.', escalatedBlocked: 'Avviso {n} su {n}. Il conteggio riparte da zero.',
      tally: 'Conteggio', untilLabel: 'Fino a', lifts: 'Termina', banWord: 'ban', status: 'Stato', notApplied: 'Non applicato: {why}',
      ownerBlocked: 'il proprietario del server non può essere silenziato né bannato', adminBlocked: 'gli amministratori non possono essere silenziati',
      failed: 'Non riuscito: il bot non ha i permessi', canTalk: 'Può parlare di nuovo', backIn: 'Può rientrare nel server', clean: 'Ora nessun avviso',
      mistake: 'Il bot ha sbagliato? Scrivi al proprietario.', warnsAddShort: 'Gli avvisi si sommano: 3 in 30 giorni = silenziamento di 1 ora.',
      updated: 'Aggiornato il {d}', actNone: 'RIMOSSO', actWarn: 'AVVISO', actMute: 'SILENZIATO {d}', actBan: 'BAN {d}',
      serversTitle: 'Server', onlineN: '{n} online', noRoomsNow: 'Nessuna stanza al momento. Premi Gioca e se ne apre una nuova.', stOpen: 'aperta', stFull: 'piena',
      stFreeing: 'si libera un posto', phHiding: 'Nascondiglio', phHunt: 'Caccia', phStory: 'Storia terminata', leftT: 'restano {t}', mapN: 'mappa {m}',
      moreRooms: '+ altre {n} stanze', refresh: 'Aggiorna', playNow: 'Gioca', gRaceMode: 'Corsa', gHnsMode: 'Nascondino', playersN: '{n} giocatori',
      playerN: '1 giocatore', roomsN: '{n} stanze', roomN: '1 stanza', upTo40: 'fino a 40 giocatori ciascuna',
      openProfile: 'Apri profilo', tabProfile: 'Profilo', tabMaps: 'Mappe', tabFriends: 'Amici', perToday: 'Oggi', perWeek: 'Questa settimana', perAll: 'Sempre',
      joined: 'Iscritto il {d}', coinsL: 'Monete', raceScores: 'Punti corsa', hsScores: 'Punti nascondino', noRank: 'nessun rango', aboutL: 'Info',
      nothingWritten: 'Ancora nulla di scritto', todayWord: 'oggi', weekWord: 'questa settimana', noMapsYet: 'Nessuna mappa pubblicata', noFriendsYet: 'Ancora nessun amico',
      published: 'Pubblicata il {d}', inGameTag: 'in gioco', likesN: 'mi piace {a} · non mi piace {b}', onlineNowTag: 'online ora', minAgo: '{n} min fa',
      hAgo: '{n} h fa', dAgo: '{n} giorni fa', longAgo: 'tempo fa', friendsL: 'Amici', mapsL: 'Mappe', moreN2: '+ altri {n}', race: 'Corsa',
      hns: 'Nascondino', myLang: 'La mia lingua', rulesTitle: 'Regole del server AIBROFIST'
    },
    rules: ['Niente spam', 'Niente inviti ad altri server Discord', 'Niente contenuti per adulti', 'Niente discorsi d’odio', 'Niente truffe o link pericolosi',
            'Vietato vendere account o monete per soldi veri', 'Niente indirizzi IP di altre persone'],
    short: ['Più di 3 messaggi in 2 secondi. Silenziamento alla 5ª volta.', 'Il messaggio viene eliminato e ricevi un avviso.', 'Immagini, link e testo.',
            'Insulti e invitare qualcuno a farsi del male.', 'Phishing, Nitro falso, IP grabber, .exe. L’unico ban.',
            'Il messaggio viene eliminato e ricevi un avviso.', 'Il messaggio viene eliminato, nessuna punizione.'],
    notes: { flood: 'Più di 3 messaggi in 2 secondi', invite: 'Invito a un altro server', 'nsfw-link': 'Link a un sito 18+', 'nsfw-image': 'Immagine 18+',
             slur: 'Insulto o discorso d’odio', selfharm: 'Istigazione all’autolesionismo', 'scam-text': 'Messaggio truffa noto', 'everyone-link': 'Menzione di massa con link',
             badfile: 'File eseguibile', scam: 'Link truffa o phishing', grabber: 'Link che ruba l’indirizzo IP', cheat: 'Vendita per soldi veri',
             custom: 'Parola vietata su questo server', 'native-word': 'Bloccato da una regola AutoMod del server', warns: '3 avvisi in 30 giorni' },
    units: { plural: 'one', min: ['minuto', 'minuti'], hour: ['ora', 'ore'], day: ['giorno', 'giorni'] }
  },

  /* ---------- 简体中文 ---------- */
  zh: {
    name: '中文', locale: 'zh-CN',
    s: {
      warn: '警告', mute: '禁言', ban: '封禁', unmute: '已解除禁言', unban: '已解除封禁', unwarn: '警告已清除',
      removed: '消息已删除', rule: '规则', reason: '原因', other: '其他', customWords: '本服务器的违禁词',
      nativeWord: '服务器 AutoMod 规则', noReason: '未说明原因', by: '执行人：{who}', byBot: '自动，由机器人执行', caseN: '案件 {n}',
      ofLimit: '{n}/{limit}', forever: '永久', permanent: '永久封禁', nextMute: '30 天内累计 {limit} 次警告将禁言 1 小时。',
      escalated: '警告 {n}/{n}：禁言 {d}。计数重新开始。', escalatedBlocked: '警告 {n}/{n}。计数重新开始。',
      tally: '计数', untilLabel: '截止', lifts: '解除时间', banWord: '封禁', status: '状态', notApplied: '未执行：{why}',
      ownerBlocked: '无法对服务器所有者禁言或封禁', adminBlocked: '无法对管理员禁言',
      failed: '失败：机器人没有权限', canTalk: '可以重新发言', backIn: '可以重新加入服务器', clean: '记录已清空',
      mistake: '觉得机器人判错了？请联系服主。', warnsAddShort: '警告会累计：30 天内 3 次警告将禁言 1 小时。',
      updated: '更新于 {d}', actNone: '删除', actWarn: '警告', actMute: '禁言 {d}', actBan: '封禁 {d}',
      serversTitle: '服务器', onlineN: '{n} 人在线', noRoomsNow: '目前没有房间。点击“开始游戏”即可新建一个。', stOpen: '开放', stFull: '已满',
      stFreeing: '即将空出位置', phHiding: '躲藏中', phHunt: '追捕中', phStory: '剧情结束', leftT: '剩余 {t}', mapN: '地图 {m}',
      moreRooms: '另有 {n} 个房间', refresh: '刷新', playNow: '开始游戏', gRaceMode: '竞速', gHnsMode: '捉迷藏', playersN: '{n} 名玩家',
      playerN: '1 名玩家', roomsN: '{n} 个房间', roomN: '1 个房间', upTo40: '每个房间最多 40 名玩家',
      openProfile: '打开资料', tabProfile: '资料', tabMaps: '地图', tabFriends: '好友', perToday: '今日', perWeek: '本周', perAll: '全部',
      joined: '注册于 {d}', coinsL: '金币', raceScores: '竞速得分', hsScores: '捉迷藏得分', noRank: '暂无段位', aboutL: '简介',
      nothingWritten: '还没有填写', todayWord: '今日', weekWord: '本周', noMapsYet: '还没有发布地图', noFriendsYet: '还没有好友',
      published: '发布于 {d}', inGameTag: '已入游戏', likesN: '点赞 {a} · 点踩 {b}', onlineNowTag: '在线', minAgo: '{n} 分钟前',
      hAgo: '{n} 小时前', dAgo: '{n} 天前', longAgo: '很久以前', friendsL: '好友', mapsL: '地图', moreN2: '另有 {n} 个', race: '竞速',
      hns: '捉迷藏', myLang: '我的语言', rulesTitle: 'AIBROFIST 服务器规则'
    },
    rules: ['禁止刷屏', '禁止邀请到其他 Discord 服务器', '禁止成人内容', '禁止仇恨言论', '禁止诈骗和危险链接', '禁止用真实货币出售账号或金币', '禁止发布他人的 IP 地址'],
    short: ['2 秒内发送超过 3 条消息。第 5 次将被禁言。', '消息会被删除，并收到一次警告。', '图片、链接和文字。', '辱骂，以及叫别人伤害自己。',
            '钓鱼、假 Nitro、IP 窃取、.exe。唯一会被封禁的规则。', '消息会被删除，并收到一次警告。', '消息会被删除，不作处罚。'],
    notes: { flood: '2 秒内发送超过 3 条消息', invite: '邀请到其他服务器', 'nsfw-link': '成人网站链接', 'nsfw-image': '成人图片',
             slur: '辱骂或仇恨言论', selfharm: '怂恿自残', 'scam-text': '已知的诈骗消息', 'everyone-link': '带链接的群发提及',
             badfile: '可执行文件', scam: '诈骗或钓鱼链接', grabber: '窃取 IP 地址的链接', cheat: '用真实货币交易',
             custom: '本服务器的违禁词', 'native-word': '被服务器 AutoMod 规则拦截', warns: '30 天内 3 次警告' },
    units: { plural: 'none', sep: '', min: ['分钟'], hour: ['小时'], day: ['天'] }
  },

  /* ---------- 日本語 ---------- */
  ja: {
    name: '日本語', locale: 'ja',
    s: {
      warn: '警告', mute: 'ミュート', ban: 'BAN', unmute: 'ミュート解除', unban: 'BAN解除', unwarn: '警告を削除しました',
      removed: 'メッセージを削除しました', rule: 'ルール', reason: '理由', other: 'その他', customWords: 'このサーバーの禁止ワード',
      nativeWord: 'サーバーのAutoModルール', noReason: '理由なし', by: '実行者：{who}', byBot: '自動（ボット）', caseN: 'ケース {n}',
      ofLimit: '{n} / {limit}', forever: '無期限', permanent: '永久BAN', nextMute: '30日以内に警告が{limit}回たまると1時間ミュートされます。',
      escalated: '警告 {n}/{n}：{d}ミュート。カウントはリセットされます。', escalatedBlocked: '警告 {n}/{n}。カウントはリセットされます。',
      tally: 'カウント', untilLabel: '期限', lifts: '解除', banWord: 'BAN', status: '状態', notApplied: '適用されませんでした：{why}',
      ownerBlocked: 'サーバーオーナーはミュートもBANもできません', adminBlocked: '管理者はミュートできません',
      failed: '失敗：ボットに権限がありません', canTalk: 'また発言できます', backIn: 'サーバーに再参加できます', clean: '警告はなくなりました',
      mistake: 'ボットの間違いだと思う場合は、オーナーに連絡してください。', warnsAddShort: '警告は累積します：30日以内に3回で1時間ミュート。',
      updated: '{d} 更新', actNone: '削除', actWarn: '警告', actMute: 'ミュート {d}', actBan: 'BAN {d}',
      serversTitle: 'サーバー', onlineN: 'オンライン {n}人', noRoomsNow: '現在ルームはありません。「プレイ」を押すと新しく作られます。', stOpen: '空きあり', stFull: '満員',
      stFreeing: '空きが出ます', phHiding: '隠れ中', phHunt: '捜索中', phStory: 'ストーリー終了', leftT: '残り {t}', mapN: 'マップ {m}',
      moreRooms: 'ほか {n} ルーム', refresh: '更新', playNow: 'プレイ', gRaceMode: 'レース', gHnsMode: 'かくれんぼ', playersN: '{n}人',
      playerN: '1人', roomsN: '{n}ルーム', roomN: '1ルーム', upTo40: '各ルーム最大40人',
      openProfile: 'プロフィールを開く', tabProfile: 'プロフィール', tabMaps: 'マップ', tabFriends: 'フレンド', perToday: '今日', perWeek: '今週', perAll: '通算',
      joined: '登録日 {d}', coinsL: 'コイン', raceScores: 'レースのスコア', hsScores: 'かくれんぼのスコア', noRank: 'ランクなし', aboutL: '自己紹介',
      nothingWritten: 'まだ何も書かれていません', todayWord: '今日', weekWord: '今週', noMapsYet: '公開されたマップはまだありません', noFriendsYet: 'フレンドはまだいません',
      published: '{d} 公開', inGameTag: 'ゲーム内', likesN: '高評価 {a} · 低評価 {b}', onlineNowTag: 'オンライン', minAgo: '{n}分前',
      hAgo: '{n}時間前', dAgo: '{n}日前', longAgo: 'ずっと前', friendsL: 'フレンド', mapsL: 'マップ', moreN2: 'ほか {n}', race: 'レース',
      hns: 'かくれんぼ', myLang: '自分の言語', rulesTitle: 'AIBROFIST サーバールール'
    },
    rules: ['スパム禁止', '他のDiscordサーバーへの招待禁止', 'アダルトコンテンツ禁止', 'ヘイトスピーチ禁止', '詐欺・危険なリンク禁止', 'アカウントやコインの現金取引禁止',
            '他人のIPアドレスの投稿禁止'],
    short: ['2秒間に3件を超えるメッセージ。5回目でミュート。', 'メッセージは削除され、警告が入ります。', '画像、リンク、テキスト。', '誹謗中傷や、他人に自傷を促す発言。',
            'フィッシング、偽Nitro、IP収集、.exe。唯一のBAN対象。', 'メッセージは削除され、警告が入ります。', 'メッセージは削除されます。処罰なし。'],
    notes: { flood: '2秒間に3件を超えるメッセージ', invite: '他サーバーへの招待', 'nsfw-link': '成人向けサイトへのリンク', 'nsfw-image': '成人向け画像',
             slur: '誹謗中傷またはヘイトスピーチ', selfharm: '自傷を促す発言', 'scam-text': '既知の詐欺メッセージ', 'everyone-link': 'リンク付きの一斉メンション',
             badfile: '実行ファイル', scam: '詐欺・フィッシングのリンク', grabber: 'IPアドレスを盗むリンク', cheat: '現金での取引',
             custom: 'このサーバーの禁止ワード', 'native-word': 'サーバーのAutoModルールでブロック', warns: '30日間で警告3回' },
    units: { plural: 'none', sep: '', min: ['分'], hour: ['時間'], day: ['日'] }
  }
};

module.exports = { PACKS, KEYS, NOTE_KEYS };
