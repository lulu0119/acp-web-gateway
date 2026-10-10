import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorRoot,
  ModelSelectorTrigger,
} from "@/components/assistant-ui/elements/model-selector.aui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAcpConfigOptions, useAcpModes, useAcpRuntimeExtras } from "@hafbit/react-acp";

type ConfigOption = ReturnType<typeof useAcpConfigOptions>[number];
type SelectConfigOption = ConfigOption & { type: "select" };
type Choice = { value: string; name: string; description?: string | null };

/** ACP select options may be grouped; the pickers show the flat list. */
function flattenChoices(option: SelectConfigOption): Choice[] {
  return option.options.flatMap((item) => ("group" in item ? item.options : [item]));
}

/** ACP tags well-known options with a category; agents advertise them as config options. */
function findSelectOption(options: readonly ConfigOption[], category: string): SelectConfigOption | undefined {
  return options.find(
    (option): option is SelectConfigOption => option.type === "select" && option.category === category,
  );
}

/** Model, reasoning effort and mode, placed in the composer like the chat apps do. */
export function SessionControls() {
  const extras = useAcpRuntimeExtras();
  const modes = useAcpModes();
  const configOptions = useAcpConfigOptions();
  const readOnly = extras.session?.access.mode === "read-only";

  const modelOption = findSelectOption(configOptions, "model");
  const effortOption = findSelectOption(configOptions, "thought_level");
  const modeOption = findSelectOption(configOptions, "mode");
  const otherOptions = configOptions.filter(
    (option) => option !== modelOption && option !== effortOption && option !== modeOption,
  );

  return (
    <div className="flex min-w-0 items-center gap-1">
      {modelOption && (
        <ModelSelector
          variant="ghost"
          size="sm"
          contentClassName="w-80"
          models={flattenChoices(modelOption).map((choice) => ({ id: choice.value, name: choice.name }))}
          value={modelOption.currentValue}
          onValueChange={(value) => void extras.setConfigOption(modelOption.id, value)}
        />
      )}
      {effortOption && (
        <OptionPicker
          value={effortOption.currentValue}
          choices={flattenChoices(effortOption)}
          disabled={readOnly}
          contentClassName="w-40"
          onChange={(value) => void extras.setConfigOption(effortOption.id, value)}
        />
      )}
      {modes ? (
        <OptionPicker
          value={modes.currentModeId}
          choices={modes.availableModes.map((mode) => ({
            value: mode.id,
            name: mode.name,
            description: mode.description,
          }))}
          disabled={readOnly}
          contentClassName="w-80"
          onChange={(value) => void extras.setMode(value)}
        />
      ) : (
        modeOption && (
          <OptionPicker
            value={modeOption.currentValue}
            choices={flattenChoices(modeOption)}
            disabled={readOnly}
            contentClassName="w-80"
            onChange={(value) => void extras.setConfigOption(modeOption.id, value)}
          />
        )
      )}
      {otherOptions.map((option) =>
        option.type === "boolean" ? (
          <label key={option.id} className="flex items-center gap-2 text-sm" title={option.description ?? undefined}>
            <span className="text-muted-foreground">{option.name}</span>
            <Switch
              checked={option.currentValue}
              disabled={readOnly}
              onCheckedChange={(checked) => void extras.setConfigOption(option.id, checked)}
            />
          </label>
        ) : (
          <ChoiceSelect
            key={option.id}
            label={option.name}
            value={option.currentValue}
            choices={flattenChoices(option)}
            disabled={readOnly}
            onChange={(value) => void extras.setConfigOption(option.id, value)}
          />
        ),
      )}
    </div>
  );
}

/**
 * A single-choice list in the same popover as the model picker. Each row
 * wraps its description, so a long one never gets cut off.
 */
function OptionPicker({
  value,
  choices,
  disabled,
  contentClassName,
  onChange,
}: {
  value: string;
  choices: readonly Choice[];
  disabled: boolean;
  contentClassName: string;
  onChange: (value: string) => void;
}) {
  const models = choices.map((choice) => ({
    id: choice.value,
    name: choice.name,
    description: choice.description ?? undefined,
  }));
  return (
    <ModelSelectorRoot models={models} value={value} onValueChange={onChange}>
      <ModelSelectorTrigger variant="ghost" size="sm" disabled={disabled} />
      <ModelSelectorContent className={contentClassName} />
    </ModelSelectorRoot>
  );
}

function ChoiceSelect({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  choices: readonly Choice[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const items = choices.map((choice) => ({ value: choice.value, label: choice.name }));
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger size="sm" className="min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
