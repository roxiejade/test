/**
 * together-listen-bubble.js — 一起听标准弹窗（丘比特之箭版）
 * 目录：js/features/together-listen-bubble.js
 * 包含：标准弹窗（头像+耳机+心电图+计时+最小化+背景上传）、持久化
 * 依赖：无（独立运行）
 * 接口：window._TLBubble 命名空间
 */

(function() {
    'use strict';

    // ============================================================
    // 状态
    // ============================================================

    var STORAGE_KEY = 'togetherListenData';

    var tlState = {
        isActive: false,
        startTime: null,
        elapsedSeconds: 0,
        isMinimized: false,
        bubbleBgImage: null,
        song: '',
        artist: '',
    };

    var timerInterval = null;
    var animationFrame = null;
    var ecgCanvas = null;
    var ecgCtx = null;
    var ballCanvas = null;
    var ballCtx = null;

    var bubbleEl = null;
    var ballEl = null;

    // 心电图进度
    var ecgProgress = 0;
    var lastTimestamp = 0;

    // ============================================================
    // 工具函数
    // ============================================================

    function getPartnerName() {
        return window.settings && window.settings.partnerName ? window.settings.partnerName : '梦角';
    }

    function getMyName() {
        return window.settings && window.settings.myName ? window.settings.myName : '我';
    }

    function getPartnerAvatarSrc() {
        var img = document.querySelector('#partner-avatar img');
        return img ? img.src : null;
    }

    function getMyAvatarSrc() {
        var img = document.querySelector('#my-avatar img');
        return img ? img.src : null;
    }

    function formatTime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    // ============================================================
    // 存储
    // ============================================================

    function getStorageKey() {
        var prefix = window.APP_PREFIX || 'CHAT_APP_V3_';
        var sid = window.SESSION_ID || 'default';
        return prefix + sid + '_' + STORAGE_KEY;
    }

    function saveState() {
        try {
            var key = getStorageKey();
            var toSave = {
                isActive: tlState.isActive,
                startTime: tlState.startTime,
                elapsedSeconds: tlState.elapsedSeconds || 0,
                bubbleBgImage: tlState.bubbleBgImage || null,
                song: tlState.song || '',
                artist: tlState.artist || '',
            };
            localforage.setItem(key, toSave).catch(function() {});
        } catch (e) {
            console.warn('[TLBubble] 保存状态失败:', e);
        }
    }

    function loadState() {
        try {
            var key = getStorageKey();
            return localforage.getItem(key).then(function(saved) {
                if (saved) {
                    tlState.isActive = saved.isActive || false;
                    tlState.startTime = saved.startTime || null;
                    tlState.elapsedSeconds = saved.elapsedSeconds || 0;
                    tlState.bubbleBgImage = saved.bubbleBgImage || null;
                    tlState.song = saved.song || '';
                    tlState.artist = saved.artist || '';
                    if (tlState.isActive && tlState.startTime) {
                        var elapsed = (Date.now() - tlState.startTime) / 1000 + (tlState.elapsedSeconds || 0);
                        tlState.elapsedSeconds = elapsed;
                        return true;
                    }
                }
                return false;
            });
        } catch (e) {
            console.warn('[TLBubble] 加载状态失败:', e);
            return Promise.resolve(false);
        }
    }

    function clearState() {
        try {
            var key = getStorageKey();
            localforage.removeItem(key).catch(function() {});
        } catch (e) {}
        tlState.isActive = false;
        tlState.startTime = null;
        tlState.elapsedSeconds = 0;
        tlState.isMinimized = false;
    }

    // ============================================================
    // 波形数据（326个坐标点）
    // ============================================================

    var RAW_POINTS = [
        [0.0033434324269043594, -0.21041582984137475],
        [0.010047790713947374, -0.21060922479196265],
        [0.016752149000990393, -0.21080261974255032],
        [0.02345650728803341, -0.21099601469313822],
        [0.03016086557507643, -0.2111894096437259],
        [0.03692252606970101, -0.2092518787498745],
        [0.04371283766811637, -0.2062488849338029],
        [0.05044584705895017, -0.20537681696217103],
        [0.05715020534599319, -0.20557021191275893],
        [0.06385456363303621, -0.2057636068633466],
        [0.07055892192007923, -0.2059570018139345],
        [0.07726328020712225, -0.20615039676452218],
        [0.08396763849416525, -0.20634379171511008],
        [0.09067199678120827, -0.20653718666569776],
        [0.09737635506825129, -0.20673058161628566],
        [0.10408071335529431, -0.20692397656687334],
        [0.11078507164233733, -0.20711737151746124],
        [0.11748942992938036, -0.2073107664680489],
        [0.12419378821642338, -0.2075041614186366],
        [0.13089814650346637, -0.2076975563692245],
        [0.1376025047905094, -0.20789095131981217],
        [0.14430686307755242, -0.20808434627040007],
        [0.15101122136459544, -0.20827774122098774],
        [0.15780153296301083, -0.20527474740491636],
        [0.1647637511841709, -0.19587897605552684],
        [0.1717259694053309, -0.18648320470613733],
        [0.17868818762649097, -0.1770874333567476],
        [0.18559310364006948, -0.1698225878517976],
        [0.1925839729650203, -0.15936135358018788],
        [0.19957484228997116, -0.1489001193085786],
        [0.20656571161492202, -0.13843888503696955],
        [0.21352792983608207, -0.1290431136875798],
        [0.2202036370193343, -0.13030197156038725],
        [0.22665013537226025, -0.14008453281095234],
        [0.23309663372518624, -0.14986709406151766],
        [0.239571783181903, -0.158584192389863],
        [0.24604693263861976, -0.16730129071820854],
        [0.2525220820953365, -0.17601838904655387],
        [0.25893992934447174, -0.18686641321933894],
        [0.2654150788011885, -0.19558351154768427],
        [0.2719761815692776, -0.20110422110937054],
        [0.27865188875252983, -0.2023630789821782],
        [0.28535624703957285, -0.20255647393276588],
        [0.2920606053266158, -0.20274986888335378],
        [0.29876496361365884, -0.20294326383394146],
        [0.30546932190070186, -0.20313665878452936],
        [0.31205907577258174, -0.20759190542399586],
        [0.31606306752734353, -0.22503460787712481],
        [0.3200169198504715, -0.2443418704441378],
        [0.3238848188622271, -0.2668455217778105],
        [0.32777420620182574, -0.28855007591981807],
        [0.3320804671015803, -0.31138625912686235],
        [0.3368136294478175, -0.2850788156261661],
        [0.3383894401563105, -0.26806364136241534],
        [0.33632656068337424, -0.30319168530390117],
        [0.34237194358322925, -0.24472015454887575],
        [0.34523705396230747, -0.22134443524357117],
        [0.3522279232872583, -0.2108832009719619],
        [0.3590182348856737, -0.2078802071558905],
        [0.3657225931727167, -0.2080736021064784],
        [0.37242695145975974, -0.20826699705706608],
        [0.3792172630581751, -0.20526400324099492],
        [0.38609352796796276, -0.19906462065826425],
        [0.38772664088403735, -0.17991852055007418],
        [0.3938866281990555, -0.1587704245645032],
        [0.39669443637055213, -0.13752563110363814],
        [0.40006094106596907, -0.11629695388865557],
        [0.40522673507944706, -0.08637660619994181],
        [0.4099885485294751, -0.05900369977702602],
        [0.41511709610802505, -0.03462698253303098],
        [0.4177816487605678, -0.01870950368326474],
        [0.4214633155976833, -0.04813866401136524],
        [0.42524526129806656, -0.0738387041116968],
        [0.4290272069984498, -0.09953874421202835],
        [0.432809152698833, -0.12523878431236013],
        [0.4366340750549025, -0.14934063002936182],
        [0.44052346239450113, -0.1710451841713696],
        [0.4443268964227275, -0.19594612708003623],
        [0.4507877203275488, -0.20519595686949166],
        [0.45734882309563796, -0.21071666643117792],
        [0.4638239725523547, -0.2194337647595237],
        [0.470356424216653, -0.2260199372434295],
        [0.4768888758809513, -0.23260610972733575],
        [0.4833640253376681, -0.24132320805568086],
        [0.4851690448764874, -0.2573696168725059],
        [0.4890942460958245, -0.2777423423617391],
        [0.49236047192797366, -0.23945014214535876],
        [0.4906987079081083, -0.2596617051757686],
        [0.49602781321319384, -0.14465617455956914],
        [0.4955120933449597, -0.16383450715952397],
        [0.49499637347672565, -0.18301283975947857],
        [0.4944806536084916, -0.2021911723594334],
        [0.4939649337402575, -0.22136950495938823],
        [0.5019872428016765, -0.0477957461128693],
        [0.5003254787818111, -0.06800730914327935],
        [0.49980975891357704, -0.08718564174323395],
        [0.499294039045343, -0.10636397434318878],
        [0.4987783191771089, -0.1255423069431436],
        [0.5068292793423187, 0.049096914825595084],
        [0.5051388642186626, 0.02781988887296527],
        [0.5046231443504284, 0.008641556273010664],
        [0.5041074244821944, -0.010536776326944164],
        [0.5035917046139603, -0.029715108926898992],
        [0.510467969523748, 0.14282541948916494],
        [0.5099522496555139, 0.12364708688921011],
        [0.5094365297872798, 0.1044687542892555],
        [0.5089208099190458, 0.08529042168930068],
        [0.5084050900508117, 0.06611208908934585],
        [0.5164202363362831, 0.23941948220530973],
        [0.5145937284696207, 0.2130815073721366],
        [0.5141639619127589, 0.19709956353884084],
        [0.5126168023080566, 0.18114985219730984],
        [0.5121010824398226, 0.161971519597355],
        [0.5202666470201954, 0.34087259305497253],
        [0.5197509271519614, 0.3216942604550177],
        [0.5192352072837273, 0.302515927855063],
        [0.5187194874154932, 0.28333759525510815],
        [0.5182037675472592, 0.2641592626551533],
        [0.5262260766086783, 0.43773302150167237],
        [0.5245643125888129, 0.4175214584712623],
        [0.5240485927205788, 0.3983431258713076],
        [0.5235328728523447, 0.3791647932713528],
        [0.5230171529841107, 0.35998646067139795],
        [0.5310394620455295, 0.533560219517917],
        [0.5293776980256641, 0.513348656487507],
        [0.5288619781574301, 0.49417032388755233],
        [0.528346258289196, 0.4749919912875975],
        [0.527830538420962, 0.4558136586876427],
        [0.5358814985861718, 0.6304528804563813],
        [0.5341910834625156, 0.6091758545037517],
        [0.5336753635942816, 0.589997521903797],
        [0.5331596437260475, 0.5708191893038421],
        [0.5326439238578135, 0.5516408567038873],
        [0.5407235351268139, 0.7273455413948458],
        [0.539004468899367, 0.7050030525199963],
        [0.5373713559832924, 0.6858569524118062],
        [0.5379730291628988, 0.6666463873200867],
        [0.5374573092946647, 0.647468054720132],
        [0.5454939439079792, 0.8215745450277607],
        [0.5436459477134737, 0.7944374730029228],
        [0.5431302278452397, 0.7752591404029681],
        [0.5426145079770056, 0.7560808078030132],
        [0.5411533016836757, 0.7433274852281414],
        [0.5508144538819273, 0.9196263221839609],
        [0.5496913306133288, 0.8944942902162816],
        [0.5491756107450947, 0.8753159576163269],
        [0.5486598908768606, 0.8561376250163721],
        [0.5461385937432718, 0.8455474607777043],
        [0.5532727185871765, 0.9860918690354121],
        [0.5527569987189425, 0.9669135364354573],
        [0.5522412788507084, 0.9477352038355025],
        [0.5531008119644318, 0.8133579456687605],
        [0.5525850920961978, 0.7941796130688057],
        [0.5531008119644317, 0.7717726592104273],
        [0.5535305785212935, 0.7461693165853895],
        [0.5530148586530594, 0.7269909839854348],
        [0.5524991387848254, 0.70781265138548],
        [0.5530148586530594, 0.6854056975271015],
        [0.5535305785212936, 0.6629987436687229],
        [0.5530148586530594, 0.6438204110687681],
        [0.5524991387848254, 0.6246420784688133],
        [0.5530148586530594, 0.6022351246104347],
        [0.5535305785212935, 0.5798281707520562],
        [0.5530148586530594, 0.5606498381521013],
        [0.5524991387848254, 0.5414715055521466],
        [0.553072160860641, 0.5211954775382075],
        [0.5536165318326659, 0.4998539866020487],
        [0.5531008119644318, 0.4806756540020939],
        [0.5525850920961978, 0.46149732140213917],
        [0.5531294630682225, 0.4401558304659803],
        [0.5537024851440382, 0.41987980245204115],
        [0.552928905341687, 0.3911123035521089],
        [0.5511238858028678, 0.3655734259106006],
        [0.5528429520303147, 0.3466306283271165],
        [0.5532727185871765, 0.32072728570207876],
        [0.5527569987189425, 0.30154895310212404],
        [0.5518115122938466, 0.28025043882165124],
        [0.5536165318326659, 0.2503422678520486],
        [0.5531008119644318, 0.231163935252094],
        [0.5525850920961977, 0.21198560265213917],
        [0.5531294630682226, 0.19064411171598006],
        [0.5536165318326659, 0.1671716949353821],
        [0.5531008119644318, 0.14799336233542726],
        [0.5525850920961978, 0.12881502973547243],
        [0.5532154163795949, 0.11066992756597283],
        [0.5537884384554106, 0.09039389955203347],
        [0.5532727185871765, 0.07121556695207887],
        [0.5527140220632563, 0.0504390399687944],
        [0.5531581141720133, 0.025368428804866783],
        [0.5539316939743645, -0.0013111209063123574],
        [0.5529289053416871, -0.02474056103122435],
        [0.5519834189165913, -0.04603907531169704],
        [0.554390111635017, -0.06743428706746357],
        [0.5533586718985488, -0.09192919011459533],
        [0.5528429520303147, -0.11110752271455016],
        [0.5533586718985488, -0.1335144765729288],
        [0.553874391766783, -0.15592143043130724],
        [0.5533586718985489, -0.17509976303126207],
        [0.5528429520303149, -0.19427809563121667],
        [0.5533586718985488, -0.21668504948959533],
        [0.5538743917667829, -0.23909200334797398],
        [0.5533586718985488, -0.2582703359479286],
        [0.5528429520303147, -0.2774486685478834],
        [0.5534159741061304, -0.2977246965618223],
        [0.5539603450781553, -0.31906618749798143],
        [0.5534446252099212, -0.33824452009793626],
        [0.5529289053416871, -0.3574228526978911],
        [0.5534732763137119, -0.37876434363404976],
        [0.5540462983895276, -0.3990403716479891],
        [0.5535305785212935, -0.4182187042479437],
        [0.5530148586530594, -0.43739703684789855],
        [0.5535305785212935, -0.459803990706277],
        [0.5540462983895277, -0.4822109445646554],
        [0.5535305785212936, -0.5013892771646102],
        [0.5530148586530595, -0.5205676097645651],
        [0.5535305785212935, -0.5429745636229437],
        [0.5540462983895276, -0.5653815174813221],
        [0.5535305785212935, -0.584559850081277],
        [0.5530148586530594, -0.6037381826812318],
        [0.5535305785212935, -0.6261451365396105],
        [0.5540462983895277, -0.6485520903979889],
        [0.5535305785212936, -0.6677304229979437],
        [0.5530148586530595, -0.6869087555978985],
        [0.5535878807288751, -0.7071847836118379],
        [0.5541322517009, -0.7285262745479966],
        [0.5536165318326659, -0.7477046071479512],
        [0.5531008119644318, -0.766882939747906],
        [0.5536451829364567, -0.7882244306840644],
        [0.5542182050122724, -0.808500458698004],
        [0.5537024851440383, -0.8276787912979584],
        [0.5531867652758042, -0.8468571238979132],
        [0.5537024851440382, -0.8692640777562923],
        [0.5552496447487405, -0.8948996528730944],
        [0.5547339248805064, -0.9140779854730492],
        [0.5542182050122724, -0.933256318073004],
        [0.5537024851440383, -0.9524346506729588],
        [0.5542182050122723, -0.9748416045313371],
        [0.5537024851440382, -0.9940199371312919],
        [0.5532297419314903, -1.0116000753479173],
        [0.5635441392961719, -0.8359598556404881],
        [0.5616961431016664, -0.8630969276653264],
        [0.5611804232334323, -0.8822752602652812],
        [0.5597192169401025, -0.895028582840153],
        [0.5592034970718684, -0.9142069154401078],
        [0.5586877772036344, -0.9333852480400626],
        [0.5581720573354003, -0.9525635806400174],
        [0.5666527840574718, -0.7758041771907607],
        [0.5656499954247943, -0.7992336173156729],
        [0.5641887891314644, -0.8119869398905446],
        [0.5704204042059595, -0.7050046136827579],
        [0.5686583613228265, -0.7289452969409367],
        [0.5681426414545925, -0.7481236295408915],
        [0.5745891398075184, -0.6470120935692345],
        [0.5726122136459544, -0.6650819865912834],
        [0.5720964937777203, -0.684260319191238],
        [0.5785143410268556, -0.5842142461418007],
        [0.5765660659690824, -0.6012186762416301],
        [0.5760503461008484, -0.6203970088415847],
        [0.5833348892396547, -0.5158442067005569],
        [0.5815513580286785, -0.5405839871504003],
        [0.5800041984239762, -0.5565336984919314],
        [0.5872672532349394, -0.45277999354256804],
        [0.585419257040434, -0.4799170655674061],
        [0.5839580507471042, -0.49267038814227804],
        [0.5912211055580675, -0.3889166831929147],
        [0.589373109363562, -0.4160537552177528],
        [0.5879119030702321, -0.4288070777926245],
        [0.5943297503193674, -0.32876100474318726],
        [0.5933269616866899, -0.3521904448680995],
        [0.5918657553933601, -0.3649437674429712],
        [0.5992147635156957, -0.25799367372694904],
        [0.5973667673211902, -0.2851307457517869],
        [0.5958196077164879, -0.3010804570933179],
        [0.6022088038618324, -0.22982337127165597],
        [0.608970464356457, -0.22788584037780413],
        [0.6157034737472907, -0.2270137724061725],
        [0.6225224364494969, -0.22294531566788112],
        [0.6292554458403307, -0.22207324769624925],
        [0.6359598041273736, -0.22226664264683715],
        [0.6426641624144167, -0.22246003759742483],
        [0.6493685207014597, -0.22265343254801273],
        [0.6560728789885028, -0.2228468274986004],
        [0.6627772372755457, -0.2230402224491883],
        [0.6695388977701704, -0.22110269155533646],
        [0.6769595336519829, -0.21545215667959838],
        [0.6834919853162813, -0.20124568593433767],
        [0.6907120634715583, -0.18226074828497074],
        [0.6981040482495802, -0.15688303310228524],
        [0.7053241264048572, -0.1378980954529183],
        [0.7124869023525529, -0.12104408364799091],
        [0.7178733098652198, -0.10371231468735198],
        [0.7245776681522629, -0.08727159505460635],
        [0.7313507890884038, -0.06827376440853339],
        [0.7391897310855617, -0.04290894222255415],
        [0.7464098092408388, -0.023924004573186997],
        [0.7533720274619989, -0.014528233223797482],
        [0.7596752702959709, -0.029638109085461162],
        [0.7639786660853464, -0.052580838584727285],
        [0.7684138569521595, -0.06507773378067161],
        [0.7739148688799897, -0.08229704715893171],
        [0.776235608287043, -0.09995776660496847],
        [0.7806192271670327, -0.11021396641507497],
        [0.7861202390948628, -0.12743327979333507],
        [0.7884409785019162, -0.14509399923937205],
        [0.7928818995894874, -0.15321927320503903],
        [0.7962054276292182, -0.16824319575533053],
        [0.8018496950760022, -0.18706607559888067],
        [0.804772107662662, -0.20314471690747027],
        [0.8108174905625171, -0.20705111583994484],
        [0.8174931977457692, -0.20830997371275228],
        [0.8241975560328122, -0.20850336866334018],
        [0.8309019143198554, -0.20869676361392786],
        [0.8376062726068983, -0.20889015856451576],
        [0.8443106308939413, -0.20908355351510344],
        [0.8510149891809843, -0.20927694846569111],
        [0.8577193474680275, -0.20947034341627901],
        [0.8644237057550704, -0.2096637383668667],
        [0.8711280640421134, -0.2098571333174546],
        [0.8778324223291564, -0.21005052826804227],
        [0.8845367806161996, -0.21024392321863017],
        [0.8912411389032425, -0.21043731816921785],
        [0.8979454971902855, -0.21063071311980575],
        [0.9046498554773285, -0.21082410807039342],
        [0.9113542137643714, -0.21101750302098132],
        [0.9180585720514146, -0.211210897971569],
        [0.9247629303384576, -0.21140429292215668],
        [0.9314672886255005, -0.21159768787274458],
        [0.9381716469125435, -0.21179108282333226],
        [0.9448760051995867, -0.21198447777392015],
        [0.9515803634866297, -0.21217787272450783],
        [0.9582847217736726, -0.21237126767509573],
        [0.9649890800607156, -0.2125646626256834],
        [0.9716934383477588, -0.2127580575762713],
        [0.9783977966348018, -0.212951452526859],
        [0.9851021549218447, -0.21314484747744689],
        [0.9918065132088877, -0.21333824242803456],
        [0.9973934784480903, -0.2134994048868577]
    ];

    var points = RAW_POINTS.map(function(p) {
        return { x: p[0], y: p[1] };
    });

    var sorted = points.slice().sort(function(a, b) { return Math.abs(a.y) - Math.abs(b.y); });
    var idx80 = Math.floor(sorted.length * 0.80);
    var scaleBase = Math.abs(sorted[idx80].y);
    if (scaleBase < 0.3) scaleBase = 0.3;
    if (scaleBase > 0.6) scaleBase = 0.6;

    var startY = points[0].y;
    var endY = points[points.length - 1].y;
    var baselineY = (startY + endY) / 2;

    // ============================================================
// 固定参数（从调试面板截图提取）
// ============================================================
var FIXED_LEFT_BASE = 5;
var FIXED_RIGHT_BASE = 77;
var FIXED_STRETCH = 105;
var FIXED_SCALE_Y = 0.51;
var FIXED_OFF_X = -6;
var FIXED_OFF_Y = 3;
var FIXED_HEART_SIZE = 0.82;
var FIXED_HEART_OFF_X = -10;
var FIXED_HEART_OFF_Y = -4;
var FIXED_ARROW_SIZE = 1.0;
var FIXED_ARROW_OFF_X = 0;
var FIXED_ARROW_OFF_Y = -3;
var FIXED_SHOW_ARROW = true;
var FIXED_SHOW_GLOW = true;
var CYCLE_DURATION = 3000; // 3秒

    // <<< 新增：三高光四芒星固定参数（最终调试结果） >>>
var HIGHLIGHT_STARS = {
    main: { x: 13, y: 10, size: 3.5 },
    sub1: { x: 19, y: 40, size: 3 },
    sub2: { x: 44, y: 15, size: 2.5 }
};
// <<< 新增结束 >>>

    // ============================================================
// 构建波形数据（1个周期）
// ============================================================
function buildOneCycle(leftBaselinePx, rightBaselinePx, stretch, drawW) {
    var waveWidth = 0.72;
    var scaledWaveWidth = waveWidth * (stretch / 100);

    var leftBase = leftBaselinePx / drawW;
    var rightBase = rightBaselinePx / drawW;

    var result = [];

    // 左侧基线
    var baseStartX = 0;
    var baseEndX = leftBase;
    for (var i = 0; i < 10; i++) {
        var t = i / 9;
        result.push({ x: baseStartX + t * (baseEndX - baseStartX), y: baselineY, isBaseline: true });
    }

    // 波形（1个周期）
    var waveStartX = leftBase;
    var waveEndX = leftBase + scaledWaveWidth;
    var dataStart = 0;
    var dataEnd = points.length - 1;
    for (var i = 0; i < points.length; i++) {
        var px = waveStartX + (points[i].x - points[dataStart].x) / (points[dataEnd].x - points[dataStart].x) *
            (waveEndX - waveStartX);
        result.push({ x: px, y: points[i].y, isBaseline: false });
    }

    // 右侧基线
    var rightStartX = waveEndX;
    var rightEndX = waveEndX + rightBaselinePx / 200;
    for (var i = 0; i < 10; i++) {
        var t = i / 9;
        result.push({ x: rightStartX + t * (rightEndX - rightStartX), y: baselineY, isBaseline: true });
    }

    // 归一化到 [0, 1]
    var xMin = result[0].x;
    var xMax = result[result.length - 1].x;
    var xRange = xMax - xMin;
    for (var i = 0; i < result.length; i++) {
        result[i].normX = (result[i].x - xMin) / xRange;
        if (!result[i].isBaseline) {
            result[i].isWave = true;
        } else {
            result[i].isWave = false;
        }
    }

    return result;
}

    // ============================================================
    // 绘制爱心
    // ============================================================
    function drawHeart(ctx, cx, cy, size, progress, heartStart, heartEnd) {
        if (size < 1) return;
        var s = size;
        ctx.save();
        var steps = 80;
        var pathPoints = [];
        var yScale = 1.25;
        for (var i = 0; i <= steps; i++) {
            var t = (i / steps) * 2 * Math.PI;
            var xRaw = 16 * Math.pow(Math.sin(t), 3);
            var yRaw = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            var px = cx + (xRaw / 18) * s;
            var py = cy - (yRaw / 18) * s * yScale * 0.9;
            pathPoints.push({ x: px, y: py });
        }

        var litLength = (progress - heartStart) / (heartEnd - heartStart);
        litLength = Math.max(0, Math.min(1, litLength));

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(180, 180, 190, 0.25)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (var i = 0; i < pathPoints.length; i++) {
            if (i === 0) ctx.moveTo(pathPoints[i].x, pathPoints[i].y);
            else ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        if (litLength > 0) {
            var litCount = Math.floor(litLength * pathPoints.length);
            if (litCount > 1) {
                ctx.shadowColor = 'rgba(120, 200, 255, 0.6)';
                ctx.shadowBlur = 16;
                ctx.strokeStyle = 'rgba(200, 235, 255, 0.9)';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                for (var i = 0; i < litCount; i++) {
                    if (i === 0) ctx.moveTo(pathPoints[i].x, pathPoints[i].y);
                    else ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
                }
                ctx.stroke();
                ctx.shadowColor = 'rgba(100, 180, 255, 0.25)';
                ctx.shadowBlur = 30;
                ctx.strokeStyle = 'rgba(150, 220, 255, 0.15)';
                ctx.lineWidth = 6;
                ctx.beginPath();
                for (var i = 0; i < litCount; i++) {
                    if (i === 0) ctx.moveTo(pathPoints[i].x, pathPoints[i].y);
                    else ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
                }
                ctx.stroke();
                ctx.shadowColor = 'rgba(100, 180, 255, 0.08)';
                ctx.shadowBlur = 50;
                ctx.strokeStyle = 'rgba(100, 180, 255, 0.06)';
                ctx.lineWidth = 12;
                ctx.beginPath();
                for (var i = 0; i < litCount; i++) {
                    if (i === 0) ctx.moveTo(pathPoints[i].x, pathPoints[i].y);
                    else ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
                }
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // ============================================================
    // 绘制箭矢
    // ============================================================
    function drawArrow(ctx, cx, cy, size, progress, arrowStart, arrowEnd, showGlow) {
        if (size < 1) return;
        var s = size * 0.6;
        ctx.save();

        var pts = [
            { x: -s * 0.8, y: -s * 0.7 },
            { x: s * 0.6, y: 0 },
            { x: -s * 0.8, y: s * 0.7 },
            { x: -s * 0.4, y: 0 },
        ];

        var litLength = (progress - arrowStart) / (arrowEnd - arrowStart);
        litLength = Math.max(0, Math.min(1, litLength));

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(180, 180, 190, 0.25)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (var i = 0; i < pts.length; i++) {
            var px = cx + pts[i].x;
            var py = cy + pts[i].y;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        if (showGlow && litLength > 0) {
            var litEdges = Math.ceil(litLength * 3);
            var litCount = litEdges + 1;
            if (litCount > pts.length) litCount = pts.length;
            if (litCount >= 2) {
                ctx.shadowColor = 'rgba(120, 200, 255, 0.6)';
                ctx.shadowBlur = 16;
                ctx.strokeStyle = 'rgba(200, 235, 255, 0.9)';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                for (var i = 0; i < litCount; i++) {
                    var px = cx + pts[i].x;
                    var py = cy + pts[i].y;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
                ctx.shadowColor = 'rgba(100, 180, 255, 0.25)';
                ctx.shadowBlur = 30;
                ctx.strokeStyle = 'rgba(150, 220, 255, 0.15)';
                ctx.lineWidth = 6;
                ctx.beginPath();
                for (var i = 0; i < litCount; i++) {
                    var px = cx + pts[i].x;
                    var py = cy + pts[i].y;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
                ctx.shadowColor = 'rgba(100, 180, 255, 0.08)';
                ctx.shadowBlur = 50;
                ctx.strokeStyle = 'rgba(100, 180, 255, 0.06)';
                ctx.lineWidth = 12;
                ctx.beginPath();
                for (var i = 0; i < litCount; i++) {
                    var px = cx + pts[i].x;
                    var py = cy + pts[i].y;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // ============================================================
// 绘制标准弹窗波形（丘比特之箭版）
// ============================================================
function drawBubbleWave(canvas, progress) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = rect.width || canvas.width / dpr;
    var h = rect.height || canvas.height / dpr;
    if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    var pad = 4;
    var drawW = w - pad * 2;
    var drawH = h - pad * 2;
    var midY = pad + drawH / 2;

    var amp = (drawH / 2) * Math.max(0.05, FIXED_SCALE_Y) * 0.85;

    var data = buildOneCycle(FIXED_LEFT_BASE, FIXED_RIGHT_BASE, FIXED_STRETCH, drawW);

    ctx.clearRect(0, 0, w, h);

    // ---- 灰色轮廓 ----
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(180, 180, 190, 0.35)';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < data.length; i++) {
        var px = pad + data[i].normX * drawW + FIXED_OFF_X;
        var py = midY + (data[i].y / scaleBase) * amp + FIXED_OFF_Y;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ---- 波形发光段 ----
if (FIXED_SHOW_GLOW) {
    var halfWidth = 0.06;
    var startX = progress - halfWidth;
    var endX = progress + halfWidth;
    var glowPoints = [];
    for (var i = 0; i < data.length; i++) {
        // ⬅️ 只排除左侧基线（左侧基线的 x 范围是 0 ~ leftBase，且 isBaseline === true）
        // 判断是否为左侧基线：左侧基线的 x 在 0 ~ FIXED_LEFT_BASE/drawW 范围内
        var leftBaseNorm = FIXED_LEFT_BASE / drawW;
        var isLeftBaseline = data[i].isBaseline && data[i].normX < leftBaseNorm + 0.01;
        
        if (data[i].normX >= startX && data[i].normX <= endX && !isLeftBaseline) {
            glowPoints.push(data[i]);
        }
    }
        if (glowPoints.length > 1) {
            ctx.shadowColor = 'rgba(120, 200, 255, 0.5)';
            ctx.shadowBlur = 18;
            ctx.lineWidth = 3.0;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            for (var i = 0; i < glowPoints.length; i++) {
                var gx = pad + glowPoints[i].normX * drawW + FIXED_OFF_X;
                var gy = midY + (glowPoints[i].y / scaleBase) * amp + FIXED_OFF_Y;
                if (i === 0) ctx.moveTo(gx, gy);
                else ctx.lineTo(gx, gy);
            }
            ctx.stroke();
            ctx.shadowColor = 'rgba(100, 180, 255, 0.3)';
            ctx.shadowBlur = 30;
            ctx.lineWidth = 8;
            ctx.strokeStyle = 'rgba(150, 220, 255, 0.2)';
            ctx.beginPath();
            for (var i = 0; i < glowPoints.length; i++) {
                var hx = pad + glowPoints[i].normX * drawW + FIXED_OFF_X;
                var hy = midY + (glowPoints[i].y / scaleBase) * amp + FIXED_OFF_Y;
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.stroke();
            ctx.shadowColor = 'rgba(100, 180, 255, 0.12)';
            ctx.shadowBlur = 50;
            ctx.lineWidth = 16;
            ctx.strokeStyle = 'rgba(100, 180, 255, 0.08)';
            ctx.beginPath();
            for (var i = 0; i < glowPoints.length; i++) {
                var fx = pad + glowPoints[i].normX * drawW + FIXED_OFF_X;
                var fy = midY + (glowPoints[i].y / scaleBase) * amp + FIXED_OFF_Y;
                if (i === 0) ctx.moveTo(fx, fy);
                else ctx.lineTo(fx, fy);
            }
            ctx.stroke();
        }
    }

    // ---- 爱心位置（0.70 - 0.90） ----
    var heartBaseX = pad + 0.85 * drawW + FIXED_OFF_X;
    var heartBaseY = midY + FIXED_OFF_Y;
    var heartCx = heartBaseX + FIXED_HEART_OFF_X;
    var heartCy = heartBaseY + FIXED_HEART_OFF_Y;
    var heartScale = FIXED_HEART_SIZE * 0.5;
    drawHeart(ctx, heartCx, heartCy, heartScale * 22, progress, 0.70, 0.90);

    // ---- 箭矢位置（0.90 - 1.00） ----
    if (FIXED_SHOW_ARROW) {
        var arrowBaseX = heartBaseX + 20 + FIXED_ARROW_OFF_X;
        var arrowBaseY = heartBaseY + FIXED_ARROW_OFF_Y;
        var arrowScale = FIXED_ARROW_SIZE * 0.8;
        drawArrow(ctx, arrowBaseX, arrowBaseY, arrowScale * 14, progress, 0.90, 1.00, FIXED_SHOW_GLOW);
    }
}

    // ============================================================
// 绘制四芒星（通用函数）
// ============================================================
function drawFourPointStar(ctx, cx, cy, outerRadius) {
    var innerRadius = outerRadius * 0.4;
    var points = 4;
    var step = Math.PI / points;

    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
        var radius = i % 2 === 0 ? outerRadius : innerRadius;
        var angle = i * step - Math.PI / 2;
        var x = cx + Math.cos(angle) * radius;
        var y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

    // ============================================================
// 绘制悬浮球波形（雾蓝底色 + 纯白发光条 + 三高光四芒星）
// ============================================================
function drawBallWave(canvas, progress) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = rect.width || canvas.width / dpr;
    var h = rect.height || canvas.height / dpr;

    if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    var pad = 8;
    var drawW = w - pad * 2;
    var drawH = h - pad * 2;
    var midY = pad + drawH / 2;
    var amp = (drawH / 2) * 0.75;

    // ===== 雾蓝底色（外深内浅） =====
    // 固定参数：RGB(30, 80, 120) · 暗度16 · 柔化80 · 边缘透0
    var r = 30,
        g = 80,
        b = 120;
    var darkness = 0.16;
    var feather = 0.80;
    var edgeOpacity = 0;

    var centerX = w / 2;
    var centerY = h / 2;
    var radius = Math.min(w, h) / 2;

    // 外深内浅：边缘深，中心浅
    var grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + edgeOpacity + ')');
    grad.addColorStop(feather, 'rgba(' + r + ',' + g + ',' + b + ',' + (darkness * 0.3) + ')');
    grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',' + darkness + ')');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // ===== 灰色轮廓 =====
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = 'rgba(180, 180, 190, 0.25)';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
        var px = pad + points[i].x * drawW;
        var py = midY + (points[i].y / scaleBase) * amp;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ===== 发光段（纯白色 + 蓝色光晕，与原版一致） =====
    var halfWidth = 0.10;
    var startX = progress - halfWidth;
    var endX = progress + halfWidth;

    var glowPoints = [];
    for (var j = 0; j < points.length; j++) {
        if (points[j].x >= startX && points[j].x <= endX) {
            glowPoints.push(points[j]);
        }
    }

    if (glowPoints.length > 1) {
        // 主发光层（纯白色）
        ctx.shadowColor = 'rgba(120, 200, 255, 0.4)';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';

        ctx.beginPath();
        for (var k = 0; k < glowPoints.length; k++) {
            var gx = pad + glowPoints[k].x * drawW;
            var gy = midY + (glowPoints[k].y / scaleBase) * amp;
            if (k === 0) ctx.moveTo(gx, gy);
            else ctx.lineTo(gx, gy);
        }
        ctx.stroke();

        // 光晕层1（蓝色光晕）
        ctx.shadowColor = 'rgba(100, 180, 255, 0.2)';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(150, 220, 255, 0.12)';
        ctx.beginPath();
        for (var m = 0; m < glowPoints.length; m++) {
            var hx = pad + glowPoints[m].x * drawW;
            var hy = midY + (glowPoints[m].y / scaleBase) * amp;
            if (m === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.stroke();

        // 最外层柔光
        ctx.shadowColor = 'rgba(100, 180, 255, 0.06)';
        ctx.shadowBlur = 30;
        ctx.lineWidth = 12;
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.04)';
        ctx.beginPath();
        for (var n = 0; n < glowPoints.length; n++) {
            var fx = pad + glowPoints[n].x * drawW;
            var fy = midY + (glowPoints[n].y / scaleBase) * amp;
            if (n === 0) ctx.moveTo(fx, fy);
            else ctx.lineTo(fx, fy);
        }
        ctx.stroke();
    }

    // ===== 进度四芒星（沿波形移动） =====
    var scanX = progress;
    var scanPx = pad + scanX * drawW;
    var scanY = midY;
    for (var n = 0; n < points.length - 1; n++) {
        if (points[n].x <= scanX && points[n + 1].x >= scanX) {
            var t = (scanX - points[n].x) / (points[n + 1].x - points[n].x);
            var yVal = points[n].y + (points[n + 1].y - points[n].y) * t;
            scanY = midY + (yVal / scaleBase) * amp;
            break;
        }
    }

    var starSize = 2.5;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    drawFourPointStar(ctx, scanPx, scanY, starSize);
    ctx.fill();

    ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.beginPath();
    ctx.arc(scanPx, scanY, starSize * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // ===== 三高光四芒星（固定位置） =====
    function drawHighlightStar(cx, cy, size, opacity) {
        opacity = opacity || 1;

        var glowSize = size * 4;
        var grad2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
        grad2.addColorStop(0, 'rgba(255, 255, 255, ' + (0.2 * opacity) + ')');
        grad2.addColorStop(0.5, 'rgba(255, 255, 255, ' + (0.08 * opacity) + ')');
        grad2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = grad2;
        ctx.beginPath();
        ctx.arc(cx, cy, glowSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'rgba(255, 255, 255, ' + (0.3 * opacity) + ')';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.5 * opacity) + ')';
        drawFourPointStar(ctx, cx, cy, size);
        ctx.fill();

        ctx.shadowColor = 'rgba(255, 255, 255, ' + (0.4 * opacity) + ')';
        ctx.shadowBlur = 4;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.7 * opacity) + ')';
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawHighlightStar(HIGHLIGHT_STARS.main.x, HIGHLIGHT_STARS.main.y, HIGHLIGHT_STARS.main.size, 1);
    drawHighlightStar(HIGHLIGHT_STARS.sub1.x, HIGHLIGHT_STARS.sub1.y, HIGHLIGHT_STARS.sub1.size, 0.7);
    drawHighlightStar(HIGHLIGHT_STARS.sub2.x, HIGHLIGHT_STARS.sub2.y, HIGHLIGHT_STARS.sub2.size, 0.6);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
}

    // ============================================================
    // Canvas 设置
    // ============================================================

    function setupEcgCanvas(canvas) {
        var container = canvas.parentElement;
        var dpr = window.devicePixelRatio || 1;
        var w = container.clientWidth || 200;
        var h = container.clientHeight || 68;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        canvas._w = w;
        canvas._h = h;
    }

    function setupBallCanvas(canvas) {
        var container = canvas.parentElement;
        var size = container.clientWidth || 56;
        var dpr = window.devicePixelRatio || 1;

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        canvas._size = size;
    }

    // ============================================================
    // 动画循环
    // ============================================================

    function startAnimation() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        lastTimestamp = 0;
        ecgProgress = 0;
        animateECG();
    }

    function animateECG(timestamp) {
        if (!tlState.isActive) {
            animationFrame = null;
            return;
        }

        if (!timestamp) timestamp = performance.now();

        if (lastTimestamp === 0) lastTimestamp = timestamp;
        var delta = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        ecgProgress = (ecgProgress + delta / CYCLE_DURATION) % 1;

        if (ecgCanvas && ecgCtx) {
            drawBubbleWave(ecgCanvas, ecgProgress);
        }

// <<< 新增：绘制粒子 >>>
        if (particleCanvas && particleCtx && particles.length > 0) {
            drawParticles(performance.now());
        }
        // <<< 新增结束 >>>
        
        if (ballCanvas && ballCtx && ballEl && ballEl.classList.contains('active')) {
            drawBallWave(ballCanvas, ecgProgress);
        }

        animationFrame = requestAnimationFrame(animateECG);
    }

    // ============================================================
    // 计时器
    // ============================================================

    function startTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        var startOffset = tlState.elapsedSeconds || 0;

        timerInterval = setInterval(function() {
            if (!tlState.isActive) {
                clearInterval(timerInterval);
                timerInterval = null;
                return;
            }
            var elapsed = (Date.now() - tlState.startTime) / 1000 + startOffset;
            tlState.elapsedSeconds = elapsed;
            updateTimerDisplay(elapsed);
            saveState();
        }, 1000);

        var initialElapsed = (Date.now() - tlState.startTime) / 1000 + startOffset;
        updateTimerDisplay(initialElapsed);
    }

    function updateTimerDisplay(seconds) {
        var display = document.getElementById('tl-timer-display');
        if (display) display.textContent = formatTime(seconds);
        var ballDisplay = document.getElementById('tl-ball-timer');
        if (ballDisplay) ballDisplay.textContent = formatTime(seconds);
    }

    // ============================================================
    // 显示/隐藏气泡
    // ============================================================

    function showBubble() {
        if (bubbleEl) {
            bubbleEl.style.display = 'flex';
            bubbleEl.classList.add('active');
        }
        if (ballEl) {
            ballEl.style.display = 'none';
            ballEl.classList.remove('active');
        }
        tlState.isMinimized = false;
        startAnimation();
    }

    function showBall() {
        if (bubbleEl) {
            bubbleEl.style.display = 'none';
            bubbleEl.classList.remove('active');
        }
        if (ballEl) {
            ballEl.style.display = 'block';
            ballEl.classList.add('active');
            var canvas = ballEl.querySelector('#tl-ball-canvas');
        if (canvas) {
            // ⬇️ 强制重新初始化，确保尺寸正确 ⬇️
            var container = canvas.parentElement;
            var size = container.clientWidth || 56;
            var dpr = window.devicePixelRatio || 1;
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            canvas.style.width = size + 'px';
            canvas.style.height = size + 'px';
            var ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            canvas._size = size;
            // ⬆️ 强制重新初始化结束 ⬆️
        }
    }
    tlState.isMinimized = true;
}

    function hideBall() {
        if (ballEl) {
            ballEl.style.display = 'none';
            ballEl.classList.remove('active');
        }
        tlState.isMinimized = false;
    }

    // ============================================================
    // 创建标准弹窗
    // ============================================================

    function createBubble(song, artist) {
        var existing = document.querySelector('.tl-bubble');
        if (existing) existing.remove();
        var existingBall = document.querySelector('.tl-float-ball');
        if (existingBall) existingBall.remove();

        tlState.song = song || '';
        tlState.artist = artist || '';

        bubbleEl = document.createElement('div');
        bubbleEl.className = 'tl-bubble';
        bubbleEl.id = 'tl-bubble';

        var partnerAvatar = getPartnerAvatarSrc() || '';
        var myAvatar = getMyAvatarSrc() || '';

        bubbleEl.innerHTML = `
        <!-- <<< 新增：粒子 Canvas（覆盖整个弹窗，最底层） >>> -->
            <canvas id="tl-particle-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;"></canvas>
            <!-- <<< 新增结束 >>> -->
            <div class="tl-bubble-toolbar" style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:0 2px;margin-bottom:4px;flex-shrink:0;">
                <span style="display:flex;align-items:center;">
                    <button class="tl-tool-btn" id="tl-upload-btn" title="上传背景图片" style="color:rgba(255,255,255,0.5);font-size:12px;padding:2px 4px;background:none;border:none;cursor:pointer;"><i class="fas fa-image"></i></button>
                </span>
                <span style="display:flex;align-items:center;gap:6px;">
                    <button class="tl-tool-btn" id="tl-minimize-btn" title="最小化" style="color:rgba(255,255,255,0.5);font-size:12px;padding:2px 4px;background:none;border:none;cursor:pointer;"><i class="fas fa-minus"></i></button>
                    <button class="tl-tool-btn tl-close-btn" id="tl-close-btn" title="关闭" style="color:rgba(255,255,255,0.5);font-size:12px;padding:2px 4px;background:none;border:none;cursor:pointer;"><i class="fas fa-power-off"></i></button>
                </span>
            </div>
            <div class="tl-avatars" id="tl-avatars-container" style="position:relative;overflow:visible;display:flex;align-items:center;justify-content:center;height:60px;width:100%;flex-shrink:0;background:transparent !important;">
                <div class="tl-avatar-item tl-avatar-left" style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;position:relative;transform:translateX(5px);z-index:2;background:transparent !important;border:2px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;">
                    ${partnerAvatar ? '<img src="' + partnerAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : '<i class="fas fa-user" style="font-size:20px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;"></i>'}
                </div>
                <div class="tl-avatar-item tl-avatar-right" style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;position:relative;transform:translateX(-5px);z-index:1;background:transparent !important;border:2px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;">
                    ${myAvatar ? '<img src="' + myAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : '<i class="fas fa-user" style="font-size:20px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;"></i>'}
                </div>
                <div class="tl-earphone" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);width:7px;height:9px;border-radius:50%/55%;border:2px solid rgba(200,200,205,0.85);background:rgba(220,220,225,0.3);box-shadow:0 1px 4px rgba(0,0,0,0.1);pointer-events:none;z-index:10;box-sizing:border-box;"></div>
<div class="tl-earphone" style="position:absolute;right:13px;top:50%;transform:translateY(-50%);width:7px;height:9px;border-radius:50%/55%;border:2px solid rgba(200,200,205,0.85);background:rgba(220,220,225,0.3);box-shadow:0 1px 4px rgba(0,0,0,0.1);pointer-events:none;z-index:10;box-sizing:border-box;"></div>
<div class="tl-cord" style="position:absolute;left:15px;top:calc(50% + 3px);width:2px;height:40px;background:linear-gradient(to bottom,rgba(180,180,190,0.6) 0%,rgba(180,180,190,0.1) 70%,transparent 100%);border-radius:2px;transform:rotate(6deg);transform-origin:top center;pointer-events:none;z-index:10;box-sizing:border-box;"></div>
<div class="tl-cord" style="position:absolute;right:15px;top:calc(50% + 3px);width:2px;height:40px;background:linear-gradient(to bottom,rgba(180,180,190,0.6) 0%,rgba(180,180,190,0.1) 70%,transparent 100%);border-radius:2px;transform:rotate(-6deg);transform-origin:top center;pointer-events:none;z-index:10;box-sizing:border-box;"></div>
            </div>
            <div class="tl-wave-wrapper" style="width:100%;flex-shrink:1;margin:-10px 0 -10px 0;position:relative;z-index:1;overflow:visible;">
    <div class="tl-wave-container" style="width:100%;flex:1;border-radius:4px;overflow:visible;position:relative;background:transparent !important;border:none;height:56px;">
        <canvas id="tl-ecg-canvas" style="width:100%;height:100%;display:block;"></canvas>
    </div>
</div>
            <div class="tl-timer" id="tl-timer-display" style="text-align:center;font-size:18px;font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:2px;color:rgba(255,255,255,0.9);text-shadow:0 0 20px rgba(0,0,0,0.6),0 1px 4px rgba(0,0,0,0.8);font-family:'SF Mono','Menlo','Consolas',monospace;padding:2px 0 0;flex-shrink:0;z-index:10;background:transparent !important;">00:00:00</div>
            <div class="tl-settings-panel" id="tl-settings-panel" style="position:absolute;top:32px;right:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-radius:12px;padding:12px 14px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 8px 24px rgba(0,0,0,0.4);display:none;flex-direction:column;gap:6px;min-width:140px;z-index:10;">
                <button class="tl-settings-btn" id="tl-upload-bg-btn" style="background:none;border:none;color:rgba(255,255,255,0.7);padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;text-align:left;transition:all 0.15s;display:flex;align-items:center;gap:8px;"><i class="fas fa-upload"></i> 上传图片</button>
                <div class="tl-settings-divider" style="height:1px;background:rgba(255,255,255,0.06);margin:2px 0;"></div>
                <button class="tl-settings-btn tl-restore-btn" id="tl-restore-bg-btn" style="background:none;border:none;color:rgba(255,255,255,0.4);padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;text-align:left;transition:all 0.15s;display:flex;align-items:center;gap:8px;"><i class="fas fa-undo"></i> 恢复原本样式</button>
            </div>
        `;

        document.body.appendChild(bubbleEl);

        // 初始化 ECG Canvas
        var canvas = bubbleEl.querySelector('#tl-ecg-canvas');
        if (canvas) {
            ecgCanvas = canvas;
            ecgCtx = canvas.getContext('2d');
            setupEcgCanvas(canvas);
        }

        // <<< 新增：初始化粒子 Canvas >>>
        var particleCanvasEl = bubbleEl.querySelector('#tl-particle-canvas');
        if (particleCanvasEl) {
            initParticles(particleCanvasEl);
        }
        // <<< 新增结束 >>>

        // 绑定气泡事件
        bindBubbleEvents();

        // 应用背景
        if (tlState.bubbleBgImage) {
            applyBubbleBg(tlState.bubbleBgImage);
        }

        // 最小化悬浮球
        ballEl = document.createElement('div');
        ballEl.className = 'tl-float-ball';
        ballEl.id = 'tl-float-ball';
        ballEl.innerHTML = `
            <canvas id="tl-ball-canvas"></canvas>
            <div class="tl-ball-timer" id="tl-ball-timer" style="text-shadow: 0 0 2px rgba(0,20,40,0.2), 0 0 20px rgba(255,255,255,0.08);">00:00:00</div>
        `;
        document.body.appendChild(ballEl);

        var ballCanvasEl = ballEl.querySelector('#tl-ball-canvas');
        if (ballCanvasEl) {
            ballCanvas = ballCanvasEl;
            ballCtx = ballCanvasEl.getContext('2d');
            setupBallCanvas(ballCanvasEl);
        }

        // 初始隐藏悬浮球
        ballEl.style.display = 'none';

        bindBallEvents();
        tlState.isMinimized = false;

        console.log('[TLBubble] 标准弹窗已创建（丘比特之箭版）');
    }

    // ============================================================
    // 绑定气泡事件
    // ============================================================

    function bindBubbleEvents() {
        if (!bubbleEl) return;

        var closeBtn = bubbleEl.querySelector('#tl-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                exitBubble();
            });
        }

        var minBtn = bubbleEl.querySelector('#tl-minimize-btn');
        if (minBtn) {
            minBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                showBall();
            });
        }

        var uploadBtn = bubbleEl.querySelector('#tl-upload-btn');
        var panel = bubbleEl.querySelector('#tl-settings-panel');
        if (uploadBtn && panel) {
            uploadBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (panel.style.display === 'flex') {
                    panel.style.display = 'none';
                } else {
                    panel.style.display = 'flex';
                }
            });
            document.addEventListener('click', function(e) {
                if (panel.style.display === 'flex' && !panel.contains(e.target) && e.target !== uploadBtn) {
                    panel.style.display = 'none';
                }
            });
        }

        var uploadBgBtn = bubbleEl.querySelector('#tl-upload-bg-btn');
        if (uploadBgBtn) {
            uploadBgBtn.addEventListener('click', function() {
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = function(e) {
                    var file = e.target.files[0];
                    if (!file) return;
                    var reader = new FileReader();
                    reader.onload = function(ev) {
                        var data = ev.target.result;
                        tlState.bubbleBgImage = data;
                        applyBubbleBg(data);
                        saveState();
                        var panel2 = bubbleEl.querySelector('#tl-settings-panel');
                        if (panel2) panel2.style.display = 'none';
                        if (typeof showNotification === 'function') {
                            showNotification('背景图片已更新', 'success');
                        }
                    };
                    reader.readAsDataURL(file);
                };
                input.click();
            });
        }

        var restoreBtn = bubbleEl.querySelector('#tl-restore-bg-btn');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', function() {
                tlState.bubbleBgImage = null;
                applyBubbleBg(null);
                saveState();
                var panel2 = bubbleEl.querySelector('#tl-settings-panel');
                if (panel2) panel2.style.display = 'none';
                if (typeof showNotification === 'function') {
                    showNotification('已恢复原本样式', 'info');
                }
            });
        }

        makeDraggable(bubbleEl);
    }

    function applyBubbleBg(data) {
        if (!bubbleEl) return;
        if (data) {
            bubbleEl.style.backgroundImage = 'url(' + data + ')';
            bubbleEl.style.backgroundSize = 'cover';
            bubbleEl.style.backgroundPosition = 'center';
            bubbleEl.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            bubbleEl.style.backdropFilter = 'blur(12px)';
            bubbleEl.style.webkitBackdropFilter = 'blur(12px)';
        } else {
            bubbleEl.style.backgroundImage = '';
            bubbleEl.style.backgroundSize = '';
            bubbleEl.style.backgroundPosition = '';
            bubbleEl.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';  // ⬅️ 改成更黑的背景
            bubbleEl.style.backdropFilter = 'blur(12px)';  // ⬅️ 降低模糊让粒子更清晰
            bubbleEl.style.webkitBackdropFilter = 'blur(12px)';
        }
    }

    // ============================================================
    // 绑定小球事件
    // ============================================================

    function bindBallEvents() {
        if (!ballEl) return;

        ballEl.addEventListener('click', function(e) {
            if (ballEl._wasDragged) return;
            hideBall();
            showBubble();
        });

        makeDraggable(ballEl);
    }

    // ============================================================
    // 拖动功能
    // ============================================================

    function makeDraggable(el) {
        var dragStartX, dragStartY, dragOrigX, dragOrigY, dragMoved = false;

        el.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            var rect = el.getBoundingClientRect();
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragOrigX = rect.left;
            dragOrigY = rect.top;
            dragMoved = false;
            el.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', function(e) {
            if (!el.classList.contains('dragging')) return;
            var dx = e.clientX - dragStartX;
            var dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                dragMoved = true;
            }
            el.style.left = (dragOrigX + dx) + 'px';
            el.style.top = (dragOrigY + dy) + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', function() {
            if (el.classList.contains('dragging')) {
                el.classList.remove('dragging');
                if (dragMoved) {
                    el._wasDragged = true;
                    setTimeout(function() { el._wasDragged = false; }, 100);
                }
                dragMoved = false;
            }
        });

        el.addEventListener('touchstart', function(e) {
            var touch = e.touches[0];
            if (!touch) return;
            var rect = el.getBoundingClientRect();
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            dragOrigX = rect.left;
            dragOrigY = rect.top;
            dragMoved = false;
            el.classList.add('dragging');
        }, { passive: true });

        el.addEventListener('touchmove', function(e) {
            if (!el.classList.contains('dragging')) return;
            var touch = e.touches[0];
            if (!touch) return;
            var dx = touch.clientX - dragStartX;
            var dy = touch.clientY - dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                dragMoved = true;
            }
            el.style.left = (dragOrigX + dx) + 'px';
            el.style.top = (dragOrigY + dy) + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            e.preventDefault();
        }, { passive: false });

        el.addEventListener('touchend', function() {
            if (el.classList.contains('dragging')) {
                el.classList.remove('dragging');
                if (dragMoved) {
                    el._wasDragged = true;
                    setTimeout(function() { el._wasDragged = false; }, 100);
                }
                dragMoved = false;
            }
        });
    }

    // ============================================================
    // 退出气泡
    // ============================================================

    function exitBubble() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        if (bubbleEl) {
            bubbleEl.classList.remove('active');
            bubbleEl.remove();
            bubbleEl = null;
        }
        if (ballEl) {
            ballEl.classList.remove('active');
            ballEl.remove();
            ballEl = null;
        }

        var durationSeconds = tlState.elapsedSeconds || 0;
        var durationText = formatTime(durationSeconds);

        tlState.isActive = false;
        tlState.startTime = null;
        tlState.elapsedSeconds = 0;
        tlState.isMinimized = false;

        clearState();

        if (typeof window.addMessage === 'function') {
            window.addMessage({
                id: Date.now() + Math.random(),
                sender: 'system',
                text: '🎵 一起听已结束 · 陪伴了 ' + durationText,
                timestamp: new Date(),
                type: 'system'
            });
        }
        console.log('[TLBubble] 已退出一起听，时长:', durationText);
    }

    // ============================================================
    // 恢复
    // ============================================================

    function restoreBubble() {
        loadState().then(function(hasState) {
            if (!hasState || !tlState.isActive) {
                return;
            }

            if (tlState.startTime && (Date.now() - tlState.startTime) > 24 * 60 * 60 * 1000) {
                clearState();
                return;
            }

            var song = tlState.song || '未知歌曲';
            var artist = tlState.artist || '未知歌手';

            createBubble(song, artist);
            showBubble();

            tlState.startTime = Date.now();
            startTimer();

            console.log('[TLBubble] 已恢复一起听');
            if (typeof showNotification === 'function') {
                showNotification('已恢复一起听', 'info', 2000);
            }
        });
    }

    // ============================================================
    // 启动
    // ============================================================

    function start(song, artist) {
        console.log('[TLBubble] start 被调用:', song, artist);

        if (tlState.isActive) {
            console.log('[TLBubble] 已激活，不重复启动');
            return;
        }

        tlState.isActive = true;
        tlState.startTime = Date.now();
        tlState.elapsedSeconds = 0;
        tlState.song = song || '';
        tlState.artist = artist || '';

        createBubble(song, artist);
        saveState();
        startTimer();
        showBubble();

        console.log('[TLBubble] 标准弹窗已启动（丘比特之箭版）');
    }

// ============================================================
    // 粒子系统（覆盖整个弹窗）
    // ============================================================

    var particleCanvas = null;
    var particleCtx = null;
    var particles = [];
    var particleAnimId = null;

    // 固定粒子参数（密度98，亮度36，大小1，浮动13，速度37）
    var PARTICLE_CONFIG = {
        density: 98,
        brightness: 36,
        size: 1,
        amplitude: 13,
        speed: 37,
    };

    function initParticles(canvas) {
        if (!canvas) return;
        particleCanvas = canvas;
        particleCtx = canvas.getContext('2d');
        
        var bubble = document.getElementById('tl-bubble');
        if (!bubble) return;
        
        var rect = bubble.getBoundingClientRect();
        var w = rect.width || 150;
        var h = rect.height || 200;
        var dpr = window.devicePixelRatio || 1;

        particleCanvas.width = w * dpr;
        particleCanvas.height = h * dpr;
        particleCanvas.style.width = w + 'px';
        particleCanvas.style.height = h + 'px';
        particleCtx.scale(dpr, dpr);

        particles = [];
        var count = PARTICLE_CONFIG.density;
        var sizeFactor = PARTICLE_CONFIG.size / 2;
        var ampFactor = PARTICLE_CONFIG.amplitude;
        var brightnessFactor = PARTICLE_CONFIG.brightness / 10;

        for (var i = 0; i < count; i++) {
            var baseOpacity = (Math.random() * 0.06 + 0.01) * brightnessFactor;
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                radius: (Math.random() * 1.2 + 0.4) * sizeFactor,
                phase: Math.random() * Math.PI * 2,
                phaseY: Math.random() * Math.PI * 2,
                ampX: (0.5 + Math.random() * 0.5) * ampFactor,
                ampY: (0.5 + Math.random() * 0.5) * ampFactor,
                opacity: Math.min(baseOpacity, 0.25),
                speedOff: 0.6 + Math.random() * 0.4,
            });
        }
    }

        // ============================================================
    // 绘制小四芒星（用于粒子）
    // ============================================================
    function drawSmallStar(ctx, cx, cy, outerRadius) {
        var innerRadius = outerRadius * 0.4;
        var points = 4;
        var step = Math.PI / points;

        ctx.beginPath();
        for (var i = 0; i < points * 2; i++) {
            var radius = i % 2 === 0 ? outerRadius : innerRadius;
            var angle = i * step - Math.PI / 2;
            var x = cx + Math.cos(angle) * radius;
            var y = cy + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

            function drawParticles(time) {
        if (!particleCanvas || !particleCtx) return;
        
        var w = parseFloat(particleCanvas.style.width) || 150;
        var h = parseFloat(particleCanvas.style.height) || 200;
        particleCtx.clearRect(0, 0, w, h);

        var speedFactor = PARTICLE_CONFIG.speed / 8;
        var t = time / 6000 * speedFactor;

        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            var dx = Math.sin(t + p.phase) * p.ampX * 0.5;
            var dy = Math.cos(t * 0.7 + p.phaseY) * p.ampY * 0.5;
            var px = p.x + dx;
            var py = p.y + dy;

            if (px < -10) px = w + 10;
            if (px > w + 10) px = -10;
            if (py < -10) py = h + 10;
            if (py > h + 10) py = -10;

            // ===== 全部小四芒星（星星粒子） =====
            var opacity = p.opacity;
            // 四芒星大小 = 圆形粒子 × 1.2（稍微大一点点）
            var starRadius = p.radius * 1.2;

            // 外层光晕
            particleCtx.shadowColor = 'rgba(200, 220, 255, ' + (opacity * 0.2) + ')';
            particleCtx.shadowBlur = 6;
            particleCtx.beginPath();
            particleCtx.arc(px, py, starRadius * 2.5, 0, Math.PI * 2);
            particleCtx.fillStyle = 'rgba(200, 220, 255, ' + (opacity * 0.12) + ')';
            particleCtx.fill();

            // 四芒星主体
            particleCtx.shadowColor = 'rgba(200, 220, 255, ' + (opacity * 0.3) + ')';
            particleCtx.shadowBlur = 3;
            particleCtx.fillStyle = 'rgba(255, 255, 255, ' + (opacity * 1.5) + ')';
            drawSmallStar(particleCtx, px, py, starRadius);
            particleCtx.fill();

            // 核心高亮（让四芒星有"闪烁"感）
            particleCtx.shadowColor = 'rgba(255, 255, 255, 0.15)';
            particleCtx.shadowBlur = 2;
            particleCtx.beginPath();
            particleCtx.arc(px - 0.2, py - 0.2, starRadius * 0.25, 0, Math.PI * 2);
            particleCtx.fillStyle = 'rgba(255, 255, 255, ' + Math.min(opacity * 3, 0.6) + ')';
            particleCtx.fill();

            // 重置阴影（避免影响下一个粒子）
            particleCtx.shadowBlur = 0;
        }

        // 重置阴影
        particleCtx.shadowColor = 'transparent';
        particleCtx.shadowBlur = 0;
    }
    
    // ============================================================
    // 对外接口
    // ============================================================

    window._TLBubble = {
        start: start,
        exit: exitBubble,
        restore: restoreBubble,
        getState: function() {
            return {
                isActive: tlState.isActive,
                elapsedSeconds: tlState.elapsedSeconds,
                isMinimized: tlState.isMinimized,
                song: tlState.song,
                artist: tlState.artist,
            };
        },
    };

    // ============================================================
    // 自动恢复
    // ============================================================

    setTimeout(function() {
        restoreBubble();
    }, 1500);

    console.log('[TLBubble] 🎯 标准弹窗模块已加载（丘比特之箭版）');
    console.log('[TLBubble] 接口: window._TLBubble.start(song, artist)');
    console.log('[TLBubble] 接口: window._TLBubble.exit()');

})();
