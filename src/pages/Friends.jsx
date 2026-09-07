import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getMyProfile,
  updateProfile,
  heartbeat,
  searchUsers,
  getFriends,
  getRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
} from "../services/friends";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import Modal from "../components/ui/Modal";

function Friends() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [profile, setProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");

  // getFriends/getRequests are async — load, then set state.
  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const myProfile = await getMyProfile(user.id);
      setProfile(myProfile);
      heartbeat(user.id);
      const [f, r] = await Promise.all([getFriends(user.id), getRequests(user.id)]);
      setFriends(f);
      setRequests(r);
    } catch (error) {
      console.error("Friends load failed", error);
      showToast(t("friends.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [user, showToast, t]);

  // Deferred so the effect body doesn't call the async loader's setState
  // synchronously (same pattern as the other pages' refresh-on-mount).
  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const results = await searchUsers(searchQuery);
        // Hide myself and existing friends/requests from search.
        const known = new Set([
          String(user?.id || ""),
          ...friends.map((f) => String(f.userId)),
          ...requests.incoming.map((r) => String(r.userId)),
          ...requests.outgoing.map((r) => String(r.userId)),
        ]);
        setSearchResults(results.filter((r) => !known.has(String(r.userId))));
      } catch {
        showToast(t("friends.searchFailed"), "error");
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, user, friends, requests, showToast, t]);

  function handleOpenEditProfile() {
    setEditUsername(profile?.username || "");
    setEditDisplayName(profile?.displayName || "");
    setShowEditProfile(true);
  }

  async function handleSaveProfile() {
    const username = editUsername.trim();
    if (!username) {
      showToast(t("friends.usernameRequired"), "warning");
      return;
    }
    try {
      const updated = await updateProfile(user.id, {
        username,
        displayName: editDisplayName.trim() || username,
      });
      setProfile(updated);
      setShowEditProfile(false);
      showToast(t("friends.profileSaved"), "success");
    } catch {
      // unique violation on username
      showToast(t("friends.usernameTaken"), "error");
    }
  }

  async function handleSendRequest(addresseeId) {
    try {
      await sendFriendRequest(user.id, addresseeId);
      showToast(t("friends.requestSent"), "success");
      setSearchResults((prev) => prev.filter((r) => String(r.userId) !== String(addresseeId)));
      const r = await getRequests(user.id);
      setRequests(r);
    } catch {
      showToast(t("friends.requestFailed"), "error");
    }
  }

  async function handleAccept(requestId) {
    try {
      await acceptFriendRequest(user.id, requestId);
      showToast(t("friends.requestAccepted"), "success");
      await load();
    } catch {
      showToast(t("friends.requestFailed"), "error");
    }
  }

  async function handleReject(requestId) {
    try {
      await rejectFriendRequest(user.id, requestId);
      await load();
    } catch {
      showToast(t("friends.requestFailed"), "error");
    }
  }

  async function handleRemove(friendId) {
    const ok = window.confirm(t("friends.removeConfirm"));
    if (!ok) return;
    try {
      await removeFriend(user.id, friendId);
      await load();
    } catch {
      showToast(t("friends.requestFailed"), "error");
    }
  }

  if (!user) {
    return (
      <section className="page-section">
        <PageHeader icon="users" title={t("friends.title")} subtitle={t("friends.subtitle")} />
        <div className="empty-state">
          <h3>{t("friends.loginRequired")}</h3>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">

      <PageHeader
        icon="users"
        title={t("friends.title")}
        subtitle={t("friends.subtitle")}
        actions={
          <button className="primary-button" onClick={handleOpenEditProfile}>
            <Icon name="pen" size={15} />
            {t("friends.editProfile")}
          </button>
        }
      />

      {profile && (
        <div className="friends-profile-card">
          <span className="account-avatar" aria-hidden="true">
            {(profile.displayName?.[0] || "T").toUpperCase()}
          </span>
          <div className="friends-profile-info">
            <strong>{profile.displayName}</strong>
            <small className="num">@{profile.username}</small>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="friends-search">
        <div className="search-box">
          <span className="search-icon">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("friends.searchPlaceholder")}
            aria-label={t("friends.searchPlaceholder")}
          />
        </div>

        {searching && <p className="friends-hint">{t("friends.searching")}</p>}

        {searchResults.length > 0 && (
          <div className="friends-results">
            {searchResults.map((result) => (
              <div key={result.userId} className="friend-row">
                <span className={`presence-dot ${result.online ? "is-online" : ""}`} aria-hidden="true" />
                <div className="friend-info">
                  <strong>{result.displayName}</strong>
                  <small className="num">@{result.username}</small>
                </div>
                <button
                  type="button"
                  className="secondary-button btn-sm"
                  onClick={() => handleSendRequest(result.userId)}
                >
                  <Icon name="plus" size={14} />
                  {t("friends.add")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incoming requests */}
      {requests.incoming.length > 0 && (
        <div className="friends-section">
          <h3>{t("friends.incomingRequests")}</h3>
          {requests.incoming.map((request) => (
            <div key={request.id} className="friend-row">
              <span className={`presence-dot ${request.online ? "is-online" : ""}`} aria-hidden="true" />
              <div className="friend-info">
                <strong>{request.displayName}</strong>
                <small className="num">@{request.username}</small>
              </div>
              <div className="friend-actions">
                <button type="button" className="primary-button btn-sm" onClick={() => handleAccept(request.id)}>
                  <Icon name="check" size={14} />
                  {t("friends.accept")}
                </button>
                <button type="button" className="secondary-button btn-sm" onClick={() => handleReject(request.id)}>
                  {t("friends.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Outgoing requests */}
      {requests.outgoing.length > 0 && (
        <div className="friends-section">
          <h3>{t("friends.outgoingRequests")}</h3>
          {requests.outgoing.map((request) => (
            <div key={request.id} className="friend-row">
              <span className={`presence-dot ${request.online ? "is-online" : ""}`} aria-hidden="true" />
              <div className="friend-info">
                <strong>{request.displayName}</strong>
                <small className="num">@{request.username}</small>
              </div>
              <button type="button" className="secondary-button btn-sm" onClick={() => handleReject(request.id)}>
                {t("friends.cancel")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Friends list */}
      <div className="friends-section">
        <h3>{t("friends.list")}</h3>

        {loading ? (
          <p className="friends-hint">{t("friends.loading")}</p>
        ) : friends.length === 0 ? (
          <p className="friends-hint">{t("friends.empty")}</p>
        ) : (
          friends.map((friend) => (
            <div key={friend.userId} className="friend-row">
              <span className={`presence-dot ${friend.online ? "is-online" : ""}`} aria-hidden="true" />
              <div className="friend-info">
                <strong>{friend.displayName}</strong>
                <small className="num">@{friend.username}</small>
              </div>
              <button
                type="button"
                className="secondary-button btn-icon-only btn-sm"
                aria-label={t("friends.remove")}
                title={t("friends.remove")}
                onClick={() => handleRemove(friend.userId)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <Modal
        open={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        title={t("friends.editProfileTitle")}
        size="sm"
      >
        <label className="modal-label">{t("friends.usernameLabel")}</label>
        <input
          className="input-field"
          value={editUsername}
          onChange={(e) => setEditUsername(e.target.value)}
          placeholder={t("friends.usernamePlaceholder")}
          autoFocus
        />

        <label className="modal-label">{t("friends.displayNameLabel")}</label>
        <input
          className="input-field"
          value={editDisplayName}
          onChange={(e) => setEditDisplayName(e.target.value)}
          placeholder={t("friends.displayNamePlaceholder")}
        />

        <div className="modal-buttons">
          <button type="button" className="secondary-button" onClick={() => setShowEditProfile(false)}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={handleSaveProfile}>
            {t("common.save")}
          </button>
        </div>
      </Modal>

    </section>
  );
}

export default Friends;
