<a id="turkce"></a>

# Discord Özel

**Türkçe** · [English](#english)

Türkiye'deki Discord erişim engelini **yalnızca Discord için** aşan, ek paket gerektirmeyen küçük bir başlatıcı.

- VPN değildir, sistem proxy'sini / DNS ayarlarını değiştirmez, sürücü kurmaz, yönetici izni istemez.
- Diğer programlar ve tarayıcınız hiçbir şekilde etkilenmez; sadece bu programın açtığı Discord trafiği değişir.
- Tek gereksinim Node.js (harici npm paketi yok).

## Nasıl kullanılır?

1. **Node.js kurun.** [nodejs.org](https://nodejs.org) adresinden LTS sürümünü indirip kurun (varsayılan ayarlar yeterli).
2. **Bu repoyu indirin.** GitHub'da yeşil **Code** düğmesi → **Download ZIP**, ardından ZIP'i bir klasöre çıkarın.
   Ya da: `git clone https://github.com/YuCaIb/discordVpn.git`
3. **`Discord Baslat.bat` dosyasına çift tıklayın.** Bir komut penceresi açılır, proxy başlar ve Discord proxy ile açılır.
   - Discord kurulu değilse `--kur` ile çalıştırın (aşağıya bakın); kurulumu engeli aşarak indirip yapar.
   - Windows "bilgisayarınızı korudu" uyarısı verirse **Ek bilgi** → **Yine de çalıştır** deyin.
4. **Komut penceresini kapatmayın.** Discord açık kaldığı sürece arka planda çalışması gerekir; Discord'u kapatınca kendiliğinden kapanır.

Bundan sonra Discord'u **her zaman bu dosya ile açın.** Başlat menüsündeki ya da masaüstündeki normal Discord kısayolu proxy kullanmaz.

### Seçenekli çalıştırma

Seçenekler çift tıklamayla verilemez; iki yol var:

- **Komut satırından:** Klasörde adres çubuğuna `cmd` yazıp Enter'a basın, sonra örneğin `"Discord Baslat.bat" --web` yazın.
- **Kısayolla:** `Discord Baslat.bat` → sağ tık → **Kısayol oluştur**. Kısayola sağ tık → **Özellikler** → **Hedef** alanının sonuna bir boşluk bırakıp seçeneği ekleyin (ör. ` --web`). Bu kısayolu masaüstüne taşıyabilirsiniz.

| Komut | Ne yapar |
| --- | --- |
| `Discord Baslat.bat` | Proxy'yi açar, Discord masaüstü uygulamasını proxy ile başlatır. Discord kapanınca proxy de kapanır. |
| `Discord Baslat.bat --kur` | Discord kurulu değilse kurulum dosyasını engeli aşarak indirir, kurar ve başlatır. |
| `Discord Baslat.bat --web` | Discord'u Edge/Chrome'da **ayrı bir profil** ile uygulama penceresi olarak açar (normal tarayıcınız etkilenmez). |
| `Discord Baslat.bat --sadece-proxy` | Sadece proxy'yi açar (başka bir şeyi elle bağlamak için). |

Ek seçenekler: `--ptb`, `--canary` (Discord sürümü), `--port 8882`, `--gecikme 10` (parçalar arası ms), `--ayrintili` (bağlantı günlüğü).

> Discord zaten açıksa program onu kapatıp proxy ile yeniden açar; aksi halde yeni pencere eski (proxy'siz) örneğe devredilir.

### Sorun giderme

| Belirti | Çözüm |
| --- | --- |
| `Node.js bulunamadi` | Node.js'i kurun, ardından pencereyi kapatıp dosyayı yeniden açın. |
| `Discord kurulu bulunamadı` | `--kur` ile kurun ya da `--web` ile tarayıcıda açın. |
| `Proxy başlatılamadı ... EADDRINUSE` | Port başka bir program tarafından kullanılıyor: `--port 8882` ile deneyin. |
| Discord açılıyor ama bağlanamıyor | `--ayrintili` ile çalıştırıp günlüğe bakın; `--gecikme 50` gibi daha yüksek bir değer deneyin. |

## Nasıl çalışıyor?

Engel iki katmanlı:

1. **DNS zehirlemesi** — ISS DNS'i `discord.com` için engel sayfasının IP'sini döndürüyor.
   → Program alan adlarını DNS-over-HTTPS (1.1.1.1 / 8.8.8.8) ile çözer.
2. **SNI tabanlı DPI** — Doğru IP'ye bağlansanız bile TLS el sıkışmasındaki alan adı görülünce bağlantı kesiliyor (RST).
   → Program TLS ClientHello'yu SNI'nin ortasından iki TLS kaydına ve birkaç TCP paketine böler. Sunucu bunu normal şekilde birleştirir, DPI ise alan adını yakalayamaz.

Bunu `127.0.0.1:8881` üzerinde çalışan yerel bir HTTP proxy yapar ve Discord `--proxy-server` parametresiyle yalnızca bu proxy'yi kullanacak şekilde açılır.

## Notlar

- Yalnızca Windows'ta çalışır.
- Sesli sohbet, Discord'un ses sunucularına doğrudan UDP ile gider (proxy'den geçmez). Bu sunuculara IP üzerinden bağlanıldığı için genelde engele takılmaz; takılırsa ayrıca ele alınması gerekir.
- Düz HTTP istekleri (nadiren) otomatik olarak HTTPS'e yönlendirilir; çünkü düz HTTP'de `Host` başlığı da engelleniyor.

---

<a id="english"></a>

# Discord Özel (English)

[Türkçe](#turkce) · **English**

A tiny launcher that bypasses the Discord block in Turkey **for Discord only**, with no extra packages.

- It is not a VPN. It does not change your system proxy or DNS settings, install drivers, or ask for admin rights.
- Other programs and your browser are not affected at all; only the Discord traffic started by this tool is changed.
- The only requirement is Node.js (no npm packages).

## How to use

1. **Install Node.js.** Download the LTS version from [nodejs.org](https://nodejs.org) and install it with the default options.
2. **Download this repo.** On GitHub click the green **Code** button → **Download ZIP**, then extract it to a folder.
   Or: `git clone https://github.com/YuCaIb/discordVpn.git`
3. **Double-click `Discord Baslat.bat`.** A console window opens, the proxy starts, and Discord launches through it.
   - If Discord isn't installed, run it with `--kur` (see below); it downloads and runs the installer through the proxy.
   - If Windows shows "Windows protected your PC", click **More info** → **Run anyway**.
4. **Keep the console window open.** It must run in the background while Discord is open; it closes by itself when you quit Discord.

From now on, **always start Discord with this file.** The regular Discord shortcut in the Start menu or on the desktop does not use the proxy.

### Running with options

Options can't be passed by double-clicking. Two ways:

- **From the command line:** type `cmd` in the folder's address bar and press Enter, then run e.g. `"Discord Baslat.bat" --web`.
- **With a shortcut:** right-click `Discord Baslat.bat` → **Create shortcut**. Right-click the shortcut → **Properties** → append a space and the option to the end of **Target** (e.g. ` --web`). You can move this shortcut to your desktop.

| Command | What it does |
| --- | --- |
| `Discord Baslat.bat` | Starts the proxy and launches the Discord desktop app through it. The proxy stops when Discord closes. |
| `Discord Baslat.bat --kur` (or `--install`) | If Discord isn't installed, downloads the installer through the proxy, installs it, and launches it. |
| `Discord Baslat.bat --web` | Opens Discord in Edge/Chrome as an app window with a **separate profile** (your normal browser is untouched). |
| `Discord Baslat.bat --sadece-proxy` (or `--proxy-only`) | Only starts the proxy (to connect something else manually). |

More options: `--ptb`, `--canary` (Discord build), `--port 8882`, `--gecikme 10` (delay between fragments, in ms), `--ayrintili` or `--verbose` (connection log).

> If Discord is already running, the tool closes it and reopens it through the proxy; otherwise the new window would be handed off to the old (non-proxied) instance.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Node.js bulunamadi` (Node.js not found) | Install Node.js, then close the window and run the file again. |
| `Discord kurulu bulunamadı` (Discord not installed) | Install it with `--kur`, or open it in the browser with `--web`. |
| `Proxy başlatılamadı ... EADDRINUSE` (proxy couldn't start) | Another program is using the port: try `--port 8882`. |
| Discord opens but can't connect | Run with `--verbose` and check the log; try a higher value such as `--gecikme 50`. |

## How it works

The block has two layers:

1. **DNS poisoning** — the ISP's DNS returns the block page's IP for `discord.com`.
   → The tool resolves domains over DNS-over-HTTPS (1.1.1.1 / 8.8.8.8).
2. **SNI-based DPI** — even when you connect to the correct IP, the connection is reset (RST) once the domain name is seen in the TLS handshake.
   → The tool splits the TLS ClientHello in the middle of the SNI into two TLS records and several TCP packets. The server reassembles it normally, but the DPI can't catch the domain name.

A local HTTP proxy on `127.0.0.1:8881` does this, and Discord is started with `--proxy-server` so that only Discord uses it.

## Notes

- Windows only.
- Voice chat goes directly to Discord's voice servers over UDP (not through the proxy). Since those servers are reached by IP, they usually aren't blocked; if they are, that needs to be handled separately.
- Plain HTTP requests (rare) are automatically redirected to HTTPS, because the `Host` header is also blocked on plain HTTP.
