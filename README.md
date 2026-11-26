# MargoTools - Data Scrapper

Narzędzie ułatwiające zbieranie danych z gry Margonem (mapy, przejścia, NPC, dialogi, battleNPC) za pomocą skryptu Tampermonkey.

---

#### Instrukcja
Odpalamy skrypt. Klikamy w npc i wszystkie opcje. Następnie chodzimy po wybranych mapach. Bijemy mobki by wyciągnąć dane o battle_npc. Wszystko na bieżąco się zapisuje do bazy. Podgląd jest pod fioletowym widgetem. Dodatek do margonem stworzony pod NI. Zbiera także dane questów.

Do widoku z grafami GraphVisualizer


---

## Wymagania
* Konto Margonem (najlepiej multi by bana nie dostać).
* Przeglądarka internetowa z zainstalowanym rozszerzeniem **Tampermonkey**.

---

##### Tampermonkey 
- scrapper
https://pjsoftwaredeveloper.github.io/MargoScrapper/src/DataScrapper.user.js

- widok danych z bazy
https://pjsoftwaredeveloper.github.io/MargoScrapper/src/GraphVisualizer.user.js


### Użyte narzędzia
- MongoDB Atlas
- PyMongo
- Render
- Flask
- Flask-CORS
- Gunicorn
- Tampermonkey
