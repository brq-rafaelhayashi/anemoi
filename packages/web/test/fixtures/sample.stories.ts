const meta = {title: 'Action/Button', component: 'tgr-button', args: {label: 'Salvar', variant: 'primary', disabled: false}};
export default meta;
export const Primary = {args: {variant: 'primary'}};
export const Disabled = {args: {disabled: true}};
export const FullWidth = {args: {fullWidth: true, label: 'Continuar'}};
export const OnBrand = {args: {brand: true, label: 'Entrar'}};
export const ComIcone = {
  args: {label: 'Baixar'},
  parameters: {anemoi: {slots: {icon: {icon: 'add'}}}},
};
export const SlotInvalido = {
  args: {label: 'Baixar'},
  parameters: {anemoi: {slots: {icon: {componente: 'x'}}}},
};
