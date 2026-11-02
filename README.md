# 写真アプリ (photo-apps)

写真・動画まわりの小さな Web アプリをまとめたリポジトリです。

**入口:** https://mizuho-works.github.io/photo-apps/

| パス | アプリ | 内容 |
| --- | --- | --- |
| `best-shot-picker/` | ベストショット整理 | 連写した写真・動画から「いらないかも」を自動で選ぶ |
| `koma/` | コマ選び | 動画からアルバム用の一枚を切り出す（撮影日時つき JPEG） |
| `hizuke/` | 日付そろえ | 切り出した写真を元の動画と照合し、撮影日時を入れる |
| `bounce/` | バウンスメーカー | 動画の一部を「行って戻る」ループ動画にする |

`main` に push すると GitHub Actions で GitHub Pages にデプロイされます。
