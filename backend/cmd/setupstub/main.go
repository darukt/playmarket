// Витрина Setup — честно демонстрирует, что произошло бы при установке.
// Имя приложения берётся из имени исполняемого файла: "WhatsApp-Setup.exe" → "WhatsApp".
// Настоящие APK/EXE для сторонних приложений добавляются через Студию.
package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func appNameFromExe() string {
	exe, err := os.Executable()
	if err != nil {
		return "Приложение Витрины"
	}
	name := strings.TrimSuffix(filepath.Base(exe), filepath.Ext(exe))
	name = strings.TrimSuffix(name, "-Setup")
	name = strings.ReplaceAll(name, "_", " ")
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Приложение Витрины"
	}
	return name
}

func spinner(label string, done time.Duration) {
	frames := []string{"|", "/", "-", "\\"}
	end := time.Now().Add(done)
	i := 0
	fmt.Print("  " + label + " ")
	for time.Now().Before(end) {
		fmt.Printf("\r  %s %s", label, frames[i%len(frames)])
		time.Sleep(70 * time.Millisecond)
		i++
	}
	fmt.Printf("\r  %s ✓\n", label)
}

func main() {
	name := appNameFromExe()
	fmt.Println()
	fmt.Println("  ╔══════════════════════════════════════════╗")
	fmt.Printf("  ║  %s — установка (демо)\n", padRight(name, 30))
	fmt.Println("  ╠══════════════════════════════════════════╣")
	fmt.Println("  ║  Установщик Витрина, сборка 1.0      ║")
	fmt.Println("  ║  Это демонстрационный пакет, реальный    ║")
	fmt.Println("  ║  APK/EXE добавляется через Студию.       ║")
	fmt.Println("  ╚══════════════════════════════════════════╝")
	fmt.Println()

	spinner("Проверка места на диске", 500*time.Millisecond)
	spinner("Распаковка компонентов", 900*time.Millisecond)
	spinner("Регистрация в системе", 700*time.Millisecond)
	spinner("Создание ярлыков", 500*time.Millisecond)

	fmt.Println()
	fmt.Printf("  Готово: %s установлен (демо).\n", name)
	fmt.Println("  Для настоящего приложения APK/EXE загружает разработчик в каталог.")
	fmt.Println()
	fmt.Print("  Нажмите Enter для выхода... ")
	_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
}

func padRight(s string, width int) string {
	if len([]rune(s)) >= width {
		return string([]rune(s)[:width])
	}
	r := []rune(s)
	for len(r) < width {
		r = append(r, ' ')
	}
	return string(r)
}
