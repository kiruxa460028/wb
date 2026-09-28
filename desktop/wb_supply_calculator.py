import csv
import math
import tkinter as tk
from dataclasses import dataclass, asdict
from pathlib import Path
from tkinter import filedialog, messagebox, ttk


@dataclass
class Item:
    sku: str
    stock_now: float
    sales_per_day: float
    lead_days: float
    cover_days: float
    safety_days: float
    units_per_box: int

    def recommended_units(self) -> int:
        demand_horizon = self.lead_days + self.cover_days + self.safety_days
        required_stock = self.sales_per_day * demand_horizon
        raw = max(0.0, required_stock - self.stock_now)
        if self.units_per_box <= 1:
            return math.ceil(raw)
        return math.ceil(raw / self.units_per_box) * self.units_per_box

    def recommended_boxes(self) -> int:
        units = self.recommended_units()
        if units <= 0:
            return 0
        if self.units_per_box <= 1:
            return units
        return math.ceil(units / self.units_per_box)


class SupplyCalculatorApp:
    columns = (
        "sku",
        "stock_now",
        "sales_per_day",
        "lead_days",
        "cover_days",
        "safety_days",
        "units_per_box",
        "recommended_units",
        "recommended_boxes",
    )

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Калькулятор поставок WB")
        self.root.geometry("1180x700")
        self.items: list[Item] = []

        self.default_lead = tk.StringVar(value="14")
        self.default_cover = tk.StringVar(value="21")
        self.default_safety = tk.StringVar(value="7")
        self.total_units_var = tk.StringVar(value="0")
        self.total_boxes_var = tk.StringVar(value="0")

        self.input_vars = {
            "sku": tk.StringVar(),
            "stock_now": tk.StringVar(value="0"),
            "sales_per_day": tk.StringVar(value="0"),
            "units_per_box": tk.StringVar(value="1"),
        }

        self._build_ui()
        self._refresh_table()

    def _build_ui(self) -> None:
        root = self.root
        root.columnconfigure(0, weight=1)
        root.rowconfigure(2, weight=1)

        defaults = ttk.LabelFrame(root, text="Параметры по умолчанию")
        defaults.grid(row=0, column=0, sticky="ew", padx=10, pady=(10, 6))
        for i in range(10):
            defaults.columnconfigure(i, weight=1 if i % 2 else 0)

        ttk.Label(defaults, text="Логистика (дней):").grid(row=0, column=0, padx=6, pady=8, sticky="w")
        ttk.Entry(defaults, textvariable=self.default_lead, width=10).grid(row=0, column=1, padx=6, pady=8, sticky="w")
        ttk.Label(defaults, text="Покрытие (дней):").grid(row=0, column=2, padx=6, pady=8, sticky="w")
        ttk.Entry(defaults, textvariable=self.default_cover, width=10).grid(row=0, column=3, padx=6, pady=8, sticky="w")
        ttk.Label(defaults, text="Страховой запас (дней):").grid(row=0, column=4, padx=6, pady=8, sticky="w")
        ttk.Entry(defaults, textvariable=self.default_safety, width=10).grid(row=0, column=5, padx=6, pady=8, sticky="w")

        editor = ttk.LabelFrame(root, text="Товар")
        editor.grid(row=1, column=0, sticky="ew", padx=10, pady=6)
        for i in range(14):
            editor.columnconfigure(i, weight=1 if i in (1, 3, 5, 7, 9, 11) else 0)

        ttk.Label(editor, text="SKU / Артикул:").grid(row=0, column=0, padx=6, pady=8, sticky="w")
        ttk.Entry(editor, textvariable=self.input_vars["sku"]).grid(row=0, column=1, padx=6, pady=8, sticky="ew")
        ttk.Label(editor, text="Остаток (шт):").grid(row=0, column=2, padx=6, pady=8, sticky="w")
        ttk.Entry(editor, textvariable=self.input_vars["stock_now"], width=12).grid(row=0, column=3, padx=6, pady=8, sticky="ew")
        ttk.Label(editor, text="Продажи/день:").grid(row=0, column=4, padx=6, pady=8, sticky="w")
        ttk.Entry(editor, textvariable=self.input_vars["sales_per_day"], width=12).grid(row=0, column=5, padx=6, pady=8, sticky="ew")
        ttk.Label(editor, text="Штук в коробе:").grid(row=0, column=6, padx=6, pady=8, sticky="w")
        ttk.Entry(editor, textvariable=self.input_vars["units_per_box"], width=12).grid(row=0, column=7, padx=6, pady=8, sticky="ew")

        ttk.Button(editor, text="Добавить", command=self.add_item).grid(row=0, column=8, padx=6, pady=8)
        ttk.Button(editor, text="Обновить выбранный", command=self.update_selected).grid(row=0, column=9, padx=6, pady=8)
        ttk.Button(editor, text="Удалить выбранный", command=self.remove_selected).grid(row=0, column=10, padx=6, pady=8)
        ttk.Button(editor, text="Очистить форму", command=self.clear_form).grid(row=0, column=11, padx=6, pady=8)

        table_frame = ttk.Frame(root)
        table_frame.grid(row=2, column=0, sticky="nsew", padx=10, pady=6)
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)

        self.tree = ttk.Treeview(table_frame, columns=self.columns, show="headings", height=20)
        self.tree.grid(row=0, column=0, sticky="nsew")
        self.tree.bind("<<TreeviewSelect>>", self.on_row_select)

        scroll = ttk.Scrollbar(table_frame, orient="vertical", command=self.tree.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=scroll.set)

        headers = {
            "sku": "SKU",
            "stock_now": "Остаток, шт",
            "sales_per_day": "Продажи/день",
            "lead_days": "Логистика, дн",
            "cover_days": "Покрытие, дн",
            "safety_days": "Страх. запас, дн",
            "units_per_box": "Шт в коробе",
            "recommended_units": "К отгрузке, шт",
            "recommended_boxes": "К отгрузке, коробов",
        }
        widths = {
            "sku": 190,
            "stock_now": 105,
            "sales_per_day": 105,
            "lead_days": 105,
            "cover_days": 110,
            "safety_days": 120,
            "units_per_box": 105,
            "recommended_units": 120,
            "recommended_boxes": 150,
        }
        for col in self.columns:
            self.tree.heading(col, text=headers[col])
            self.tree.column(col, width=widths[col], anchor="center")

        bottom = ttk.Frame(root)
        bottom.grid(row=3, column=0, sticky="ew", padx=10, pady=(6, 12))
        for i in range(10):
            bottom.columnconfigure(i, weight=1 if i in (1, 3, 7) else 0)

        ttk.Label(bottom, text="Итого к отгрузке (шт):").grid(row=0, column=0, padx=6, sticky="w")
        ttk.Label(bottom, textvariable=self.total_units_var).grid(row=0, column=1, padx=6, sticky="w")
        ttk.Label(bottom, text="Итого коробов:").grid(row=0, column=2, padx=6, sticky="w")
        ttk.Label(bottom, textvariable=self.total_boxes_var).grid(row=0, column=3, padx=6, sticky="w")

        ttk.Button(bottom, text="Импорт CSV", command=self.import_csv).grid(row=0, column=4, padx=6)
        ttk.Button(bottom, text="Экспорт расчёта CSV", command=self.export_csv).grid(row=0, column=5, padx=6)
        ttk.Button(bottom, text="Пересчитать", command=self._refresh_table).grid(row=0, column=6, padx=6)

    def _to_float(self, raw: str, field_name: str) -> float:
        try:
            return float(str(raw).replace(",", "."))
        except ValueError as exc:
            raise ValueError(f"Поле '{field_name}' должно быть числом.") from exc

    def _to_int(self, raw: str, field_name: str) -> int:
        value = self._to_float(raw, field_name)
        if value < 1:
            raise ValueError(f"Поле '{field_name}' должно быть >= 1.")
        return int(round(value))

    def _item_from_form(self) -> Item:
        sku = self.input_vars["sku"].get().strip()
        if not sku:
            raise ValueError("Заполните SKU / Артикул.")

        lead_days = self._to_float(self.default_lead.get(), "Логистика (дней)")
        cover_days = self._to_float(self.default_cover.get(), "Покрытие (дней)")
        safety_days = self._to_float(self.default_safety.get(), "Страховой запас (дней)")

        return Item(
            sku=sku,
            stock_now=self._to_float(self.input_vars["stock_now"].get(), "Остаток"),
            sales_per_day=self._to_float(self.input_vars["sales_per_day"].get(), "Продажи/день"),
            lead_days=lead_days,
            cover_days=cover_days,
            safety_days=safety_days,
            units_per_box=self._to_int(self.input_vars["units_per_box"].get(), "Штук в коробе"),
        )

    def clear_form(self) -> None:
        self.input_vars["sku"].set("")
        self.input_vars["stock_now"].set("0")
        self.input_vars["sales_per_day"].set("0")
        self.input_vars["units_per_box"].set("1")

    def add_item(self) -> None:
        try:
            item = self._item_from_form()
        except ValueError as e:
            messagebox.showerror("Ошибка ввода", str(e))
            return
        self.items.append(item)
        self._refresh_table()
        self.clear_form()

    def update_selected(self) -> None:
        selection = self.tree.selection()
        if not selection:
            messagebox.showwarning("Нет выбора", "Выберите строку в таблице.")
            return
        idx = int(selection[0])
        try:
            self.items[idx] = self._item_from_form()
        except ValueError as e:
            messagebox.showerror("Ошибка ввода", str(e))
            return
        self._refresh_table()

    def remove_selected(self) -> None:
        selection = self.tree.selection()
        if not selection:
            messagebox.showwarning("Нет выбора", "Выберите строку в таблице.")
            return
        idx = int(selection[0])
        del self.items[idx]
        self._refresh_table()

    def on_row_select(self, _event: object) -> None:
        selection = self.tree.selection()
        if not selection:
            return
        idx = int(selection[0])
        item = self.items[idx]
        self.input_vars["sku"].set(item.sku)
        self.input_vars["stock_now"].set(str(item.stock_now))
        self.input_vars["sales_per_day"].set(str(item.sales_per_day))
        self.input_vars["units_per_box"].set(str(item.units_per_box))
        self.default_lead.set(str(item.lead_days))
        self.default_cover.set(str(item.cover_days))
        self.default_safety.set(str(item.safety_days))

    def _refresh_table(self) -> None:
        for row in self.tree.get_children():
            self.tree.delete(row)

        total_units = 0
        total_boxes = 0
        for idx, item in enumerate(self.items):
            rec_units = item.recommended_units()
            rec_boxes = item.recommended_boxes()
            total_units += rec_units
            total_boxes += rec_boxes
            self.tree.insert(
                "",
                "end",
                iid=str(idx),
                values=(
                    item.sku,
                    self._fmt(item.stock_now),
                    self._fmt(item.sales_per_day),
                    self._fmt(item.lead_days),
                    self._fmt(item.cover_days),
                    self._fmt(item.safety_days),
                    item.units_per_box,
                    rec_units,
                    rec_boxes,
                ),
            )
        self.total_units_var.set(str(total_units))
        self.total_boxes_var.set(str(total_boxes))

    @staticmethod
    def _fmt(value: float) -> str:
        as_int = int(value)
        if as_int == value:
            return str(as_int)
        return f"{value:.2f}"

    def import_csv(self) -> None:
        file_path = filedialog.askopenfilename(
            title="Выберите CSV",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        )
        if not file_path:
            return
        try:
            loaded: list[Item] = []
            with open(file_path, "r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                required = {"sku", "stock_now", "sales_per_day", "units_per_box"}
                missing = required - set(reader.fieldnames or [])
                if missing:
                    raise ValueError(
                        "В CSV не хватает колонок: " + ", ".join(sorted(missing))
                    )
                for i, row in enumerate(reader, start=2):
                    try:
                        loaded.append(
                            Item(
                                sku=(row.get("sku") or "").strip(),
                                stock_now=self._to_float(row.get("stock_now", "0"), "stock_now"),
                                sales_per_day=self._to_float(row.get("sales_per_day", "0"), "sales_per_day"),
                                lead_days=self._to_float(
                                    row.get("lead_days", self.default_lead.get()),
                                    "lead_days",
                                ),
                                cover_days=self._to_float(
                                    row.get("cover_days", self.default_cover.get()),
                                    "cover_days",
                                ),
                                safety_days=self._to_float(
                                    row.get("safety_days", self.default_safety.get()),
                                    "safety_days",
                                ),
                                units_per_box=self._to_int(row.get("units_per_box", "1"), "units_per_box"),
                            )
                        )
                    except ValueError as e:
                        raise ValueError(f"Ошибка в строке {i}: {e}") from e

            self.items = loaded
            self._refresh_table()
            messagebox.showinfo("Импорт", f"Загружено {len(loaded)} строк.")
        except Exception as e:
            messagebox.showerror("Ошибка импорта", str(e))

    def export_csv(self) -> None:
        if not self.items:
            messagebox.showwarning("Нет данных", "Добавьте товары перед экспортом.")
            return
        target = filedialog.asksaveasfilename(
            title="Сохранить расчёт",
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            initialfile="wb_supply_result.csv",
        )
        if not target:
            return
        try:
            rows = []
            for item in self.items:
                raw = asdict(item)
                raw["recommended_units"] = item.recommended_units()
                raw["recommended_boxes"] = item.recommended_boxes()
                rows.append(raw)
            fields = list(rows[0].keys())
            with open(target, "w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
            messagebox.showinfo("Экспорт", f"Файл сохранён:\n{Path(target)}")
        except Exception as e:
            messagebox.showerror("Ошибка экспорта", str(e))


def main() -> None:
    root = tk.Tk()
    app = SupplyCalculatorApp(root)
    root.minsize(980, 560)
    root.mainloop()


if __name__ == "__main__":
    main()
