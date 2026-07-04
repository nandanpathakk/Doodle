import { useStore } from "@/store/useStore";
import { setClipboard, pasteFromClipboard, hasClipboard, cloneElements } from "@/lib/clipboard";

const PASTE_OFFSET = 20;

export const copySelection = () => {
    const { elements, appState } = useStore.getState();
    const selected = elements.filter((el) => appState.selection.includes(el.id));
    if (selected.length) setClipboard(selected);
    return selected.length > 0;
};

export const deleteSelection = () => {
    const { appState, addToHistory, removeElements, setSelection } = useStore.getState();
    if (appState.selection.length === 0) return;
    addToHistory();
    removeElements(appState.selection);
    setSelection([]);
};

export const cutSelection = () => {
    if (copySelection()) deleteSelection();
};

export const pasteClipboard = () => {
    if (!hasClipboard()) return;
    const { elements, addToHistory, setElements, setSelection } = useStore.getState();
    const pasted = pasteFromClipboard(PASTE_OFFSET, PASTE_OFFSET);
    addToHistory();
    setElements([...elements, ...pasted]);
    setSelection(pasted.map((el) => el.id));
};

export const duplicateSelection = () => {
    const { elements, appState, addToHistory, setElements, setSelection } = useStore.getState();
    const selected = elements.filter((el) => appState.selection.includes(el.id));
    if (selected.length === 0) return;
    const dupes = cloneElements(selected, PASTE_OFFSET, PASTE_OFFSET);
    addToHistory();
    setElements([...elements, ...dupes]);
    setSelection(dupes.map((el) => el.id));
};

export const selectAll = () => {
    const { elements, setSelection } = useStore.getState();
    setSelection(elements.map((el) => el.id));
};
