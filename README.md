# Discord Özel

Türkiye'deki Discord erişim engelini **yalnızca Discord için** aşan, ek paket gerektirmeyen küçük bir başlatıcı.

- VPN değildir, sistem proxy'sini / DNS ayarlarını değiştirmez, sürücü kurmaz, yönetici izni istemez.
- Diğer programlar ve tarayıcınız hiçbir şekilde etkilenmez; sadece bu programın açtığı Discord trafiği değişir.
- Tek gereksinim Node.js (harici npm paketi yok).

## Nasıl çalışıyor?

Engel iki katmanlı:

1. **DNS zehirlemesi** — ISS DNS'i `discord.com` için engel sayfasının IP'sini döndürüyor.
   → Program alan adlarını DNS-over-HTTPS (1.1.1.1 / 8.8.8.8) ile çözer.
2. **SNI tabanlı DPI** — Doğru IP'ye bağlansanız bile TLS el sıkışmasındaki alan adı görülünce bağlantı kesiliyor (RST).
   → Program TLS ClientHello'yu SNI'nin ortasından iki TLS kaydına ve birkaç TCP paketine böler. Sunucu bunu normal şekilde birleştirir, DPI ise alan adını yakalayamaz.

Bunu `127.0.0.1:8881` üzerinde çalışan yerel bir HTTP proxy yapar ve Discord `--proxy-server` parametresiyle yalnızca bu proxy'yi kullanacak şekilde açılır.

## Kullanım

| Komut | Ne yapar |
| --- | --- |
| `Discord Baslat.bat` | Proxy'yi açar, Discord masaüstü uygulamasını proxy ile başlatır. Discord kapanınca proxy de kapanır. |
| `Discord Baslat.bat --kur` | Discord kurulu değilse kurulum dosyasını engeli aşarak indirir, kurar ve başlatır. |
| `Discord Baslat.bat --web` | Discord'u Edge/Chrome'da **ayrı bir profil** ile uygulama penceresi olarak açar (normal tarayıcınız etkilenmez). |
| `Discord Baslat.bat --sadece-proxy` | Sadece proxy'yi açar (başka bir şeyi elle bağlamak için). |

Ek seçenekler: `--ptb`, `--canary` (Discord sürümü), `--port 8882`, `--gecikme 10` (parçalar arası ms), `--ayrintili` (bağlantı günlüğü).

> Discord zaten açıksa program onu kapatıp proxy ile yeniden açar; aksi halde yeni pencere eski (proxy'siz) örneğe devredilir.
> Discord'u her zaman bu dosya ile açın — Başlat menüsündeki normal kısayol proxy kullanmaz.

## Notlar

- Sesli sohbet, Discord'un ses sunucularına doğrudan UDP ile gider (proxy'den geçmez). Bu sunuculara IP üzerinden bağlanıldığı için genelde engele takılmaz; takılırsa ayrıca ele alınması gerekir.
- Düz HTTP istekleri (nadiren) otomatik olarak HTTPS'e yönlendirilir; çünkü düz HTTP'de `Host` başlığı da engelleniyor.
"# discordVpn" 
