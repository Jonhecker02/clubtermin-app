import styles from "./PageLoading.module.css";

export function PageLoading() {
  return (
    <div className={styles.wrap}>
      <div className={styles.dot} />
      <div className={styles.dot} />
      <div className={styles.dot} />
    </div>
  );
}
