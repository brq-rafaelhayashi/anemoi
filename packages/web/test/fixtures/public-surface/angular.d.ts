declare class TgrButton {
  static ɵcmp: i0.ɵɵComponentDeclaration<TgrButton, "tgr-button", never, {
    "disabled": {"alias": "disabled"; "required": false};
  }, {}, never, ["*"], true, never>;
}
declare interface TgrButton {
  tgrClick: EventEmitter<CustomEvent<{clicked: true}>>;
}
export {TgrButton};
