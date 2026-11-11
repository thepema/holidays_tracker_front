import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MONTH_OPTIONS,
  getMonthLabel,
  getPreviousMonthAndYear,
} from '../../../../core/utils/excel-export';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-export-excel-modal',
  standalone: true,
  imports: [FormsModule, ModalShellComponent],
  templateUrl: './export-excel-modal.component.html',
  styleUrl: './export-excel-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportExcelModalComponent implements OnInit {
  readonly exporting = input<boolean>(false);
  readonly availableYears = input<number[]>([]);

  readonly exportExcel = output<{ month: number; year: number }>();
  readonly cancel = output<void>();

  protected readonly months = MONTH_OPTIONS;
  protected readonly defaultPeriod = getPreviousMonthAndYear();

  protected readonly selectedMonth = signal<number>(this.defaultPeriod.month);
  protected readonly selectedYear = signal<number>(this.defaultPeriod.year);

  protected readonly yearOptions = computed<number[]>(() => {
    const currentYear = new Date().getFullYear();
    const baseYears = new Set<number>([
      this.defaultPeriod.year,
      currentYear - 2,
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
      ...this.availableYears(),
    ]);
    return [...baseYears].filter((y) => Number.isFinite(y) && y > 1900).sort((a, b) => b - a);
  });

  protected readonly selectedPeriodLabel = computed<string>(
    () => `${getMonthLabel(this.selectedMonth())} ${this.selectedYear()}`
  );

  ngOnInit(): void {
    const prev = getPreviousMonthAndYear();
    this.selectedMonth.set(prev.month);
    this.selectedYear.set(prev.year);
  }

  protected onYearChange(value: number | string): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 1900) {
      this.selectedYear.set(parsed);
    }
  }

  protected selectMonthChip(monthValue: number): void {
    this.selectedMonth.set(monthValue);
  }

  protected submitExport(): void {
    if (this.exporting()) {
      return;
    }
    this.exportExcel.emit({
      month: this.selectedMonth(),
      year: this.selectedYear(),
    });
  }
}
