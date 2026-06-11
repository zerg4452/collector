// 유튜브 플레이리스트를 만들고 영상을 관리한다.
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { YoutubePlaylist } from "../types";

type PlaylistViewProps = {
  playlists: YoutubePlaylist[];
  onCreate: (name: string) => void;
  onRename: (playlistId: string, name: string) => void;
  onDelete: (playlistId: string) => void;
  onAddItem: (playlistId: string, url: string) => void;
  onRemoveItem: (playlistId: string, itemId: string) => void;
  onMoveItem: (playlistId: string, itemId: string, direction: -1 | 1) => void;
};

function PlaylistView({
  playlists,
  onCreate,
  onRename,
  onDelete,
  onAddItem,
  onRemoveItem,
  onMoveItem
}: PlaylistViewProps) {
  const [selectedId, setSelectedId] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [renameInput, setRenameInput] = useState<string | null>(null);

  const selected = playlists.find((item) => item.id === selectedId) ?? playlists[0] ?? null;

  const handleCreate = () => {
    const name = nameInput.trim();
    if (!name) {
      return;
    }
    onCreate(name);
    setNameInput("");
  };

  const handleAddItem = () => {
    const url = urlInput.trim();
    if (!selected || !url) {
      return;
    }
    onAddItem(selected.id, url);
    setUrlInput("");
  };

  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Playlist</p>
          <h2>플레이리스트</h2>
        </div>
      </div>

      <div className="routine-layout">
        <div className="panel">
          <h3>목록</h3>
          <div className="inline-form">
            <input
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="플레이리스트 이름"
            />
            <button className="command-button" type="button" onClick={handleCreate}>
              <Plus size={17} aria-hidden="true" />
              추가
            </button>
          </div>

          <div className="item-list compact">
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className={`routine-choice ${selected?.id === playlist.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(playlist.id);
                  setRenameInput(null);
                }}
              >
                <span>
                  {playlist.name} ({playlist.items.length})
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel routine-editor">
          {selected ? (
            <>
              <div className="inline-form">
                {renameInput === null ? (
                  <>
                    <h3>{selected.name}</h3>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setRenameInput(selected.name)}
                      title="이름 변경"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() => {
                        onDelete(selected.id);
                        setSelectedId("");
                      }}
                      title="플레이리스트 삭제"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      value={renameInput}
                      onChange={(event) => setRenameInput(event.target.value)}
                      aria-label="새 이름"
                    />
                    <button
                      className="command-button"
                      type="button"
                      onClick={() => {
                        if (renameInput.trim()) {
                          onRename(selected.id, renameInput.trim());
                        }
                        setRenameInput(null);
                      }}
                    >
                      저장
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setRenameInput(null)}
                    >
                      취소
                    </button>
                  </>
                )}
              </div>

              <div className="inline-form">
                <input
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="YouTube URL 붙여넣기"
                  aria-label="YouTube URL"
                />
                <button className="command-button" type="button" onClick={handleAddItem}>
                  <Plus size={17} aria-hidden="true" />
                  추가
                </button>
              </div>

              <div className="item-list">
                {selected.items.length === 0 ? (
                  <p className="empty-state">영상 없음</p>
                ) : (
                  selected.items.map((item, index) => (
                    <div className="list-item" key={item.id}>
                      <span className="order-badge">{index + 1}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.url}</span>
                      </div>
                      <div className="item-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => onMoveItem(selected.id, item.id, -1)}
                          title="위로"
                        >
                          <ArrowUp size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => onMoveItem(selected.id, item.id, 1)}
                          title="아래로"
                        >
                          <ArrowDown size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => onRemoveItem(selected.id, item.id)}
                          title="삭제"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">플레이리스트를 만들어 주세요</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default PlaylistView;
