# Pikachu Needs Review background

These seven local PNGs are transparent frames cropped from distinct animation sheets in PMDCollab's SpriteCollab repository. Lossless WebP versions sit beside them and are used by the UI; each WebP was checked to decode to exactly the same RGBA pixels as its PNG. The Pikachu pattern appears around the edges of the app content across routes, including Pokédex, Dashboard, Collection, Missing Cards, and Collectr Import. CSS applies grayscale and 12–18% opacity. Source pixels were cropped and enlarged 4× with nearest-neighbor scaling to keep the pixel edges crisp. No image is fetched from a remote server at runtime.

## Attribution and sources

The source directory's `credits.txt` credits the animation set to **CUR** (`PMDCollab_1`; contributor ID `544245909639397378`). Each selected frame comes from `sprite/0025/0006`:

| Local file (PNG; UI uses matching WebP) | Source sheet | Frame (zero-based column, row) |
| --- | --- | --- |
| `pikachu-walk.png` / `.webp` | [Walk-Anim.png](https://github.com/PMDCollab/SpriteCollab/blob/master/sprite/0025/0006/Walk-Anim.png) | (2, 2) |
| `pikachu-charge.png` / `.webp` | [Charge-Anim.png](https://github.com/PMDCollab/SpriteCollab/blob/master/sprite/0025/0006/Charge-Anim.png) | (4, 3) |
| `pikachu-hop.png` / `.webp` | [Hop-Anim.png](https://github.com/PMDCollab/SpriteCollab/blob/master/sprite/0025/0006/Hop-Anim.png) | (4, 2) |
| `pikachu-sleep.png` / `.webp` | [Sleep-Anim.png](https://github.com/PMDCollab/SpriteCollab/blob/master/sprite/0025/0006/Sleep-Anim.png) | (0, 0) |
| `pikachu-swing.png` / `.webp` | [Swing-Anim.png](https://github.com/PMDCollab/SpriteCollab/blob/master/sprite/0025/0006/Swing-Anim.png) | (4, 3) |
| `pikachu-attack.png` / `.webp` | [Attack-Anim.png](https://github.com/PMDCollab/SpriteCollab/blob/master/sprite/0025/0006/Attack-Anim.png) | (4, 3) |
| `pikachu-idle.png` / `.webp` | [Idle-Anim.png](https://github.com/PMDCollab/SpriteCollab/blob/master/sprite/0025/0006/Idle-Anim.png) | (3, 1) |

The set-specific attribution record is [credits.txt](https://github.com/PMDCollab/SpriteCollab/blob/master/sprite/0025/0006/credits.txt). SpriteCollab states that contributed files may be copied, redistributed, and adapted for **non-commercial** use with appropriate credit under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/); see its [submission and use policy](https://github.com/PMDCollab/SpriteCollab#submission-and-use-policy) and [license text](https://github.com/PMDCollab/SpriteCollab/blob/master/LICENSE.md).

That contributor license does not grant rights to Pokémon characters, names, or other underlying Pokémon IP. Pokémon Support's [image/material guidance](https://support.pokemon.com/hc/en-us/articles/360000634094-Can-I-use-Pok%C3%A9mon-images-or-materials) asks users not to use or associate Pokémon IP with a project. The sprites are therefore attributed fan/community art, not official Pokémon assets, and the repository license should not be read as clearing the underlying IP.
