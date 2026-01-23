//! Usage: Mutex 扩展 trait，提供 poisoned 状态自动恢复能力

use std::sync::{Mutex, MutexGuard};

/// 为 Mutex 提供自动恢复能力的扩展 trait
pub(crate) trait MutexExt<T> {
    /// 获取 Mutex 锁，若发生 poisoned 则自动恢复并记录日志
    fn lock_or_recover(&self) -> MutexGuard<'_, T>;
}

impl<T> MutexExt<T> for Mutex<T> {
    #[track_caller]
    fn lock_or_recover(&self) -> MutexGuard<'_, T> {
        match self.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                let loc = std::panic::Location::caller();
                tracing::error!(
                    mutex_type = std::any::type_name::<T>(),
                    file = loc.file(),
                    line = loc.line(),
                    column = loc.column(),
                    "Mutex poisoned (线程 panic 导致)，已自动恢复数据但状态可能不一致"
                );
                poisoned.into_inner()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn test_lock_or_recover_normal() {
        let mutex = Mutex::new(42);
        let guard = mutex.lock_or_recover();
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_lock_or_recover_after_panic() {
        let mutex = Arc::new(Mutex::new(0));
        let mutex_clone = Arc::clone(&mutex);

        // 模拟导致 poisoned 的 panic
        let _ = std::thread::spawn(move || {
            let mut guard = mutex_clone.lock().unwrap();
            *guard = 100;
            panic!("模拟 panic");
        })
        .join();

        // 应能恢复并读取到 panic 前设置的值
        let guard = mutex.lock_or_recover();
        assert_eq!(*guard, 100);
    }
}
