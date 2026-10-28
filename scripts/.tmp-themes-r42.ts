import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { themeButtonStyle } from "@/lib/onepage/button-style"
for (const t of THEME_TEMPLATES) { const c: any = t.theme_config; const s = themeButtonStyle(c); console.log(t.id, c.background_color, "|", c.button_style, s.borderWidth, s.borderColor, s.backgroundColor, s.boxShadow, c.button_border_radius) }
